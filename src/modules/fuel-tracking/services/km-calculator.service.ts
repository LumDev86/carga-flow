import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TripLocationHistory } from '../entities/trip-location-history.entity';

interface LatLng {
  latitude: number;
  longitude: number;
}

export type KmCalcSource = 'gps_tracklog' | 'haversine_linear' | 'unavailable';

export interface KmCalculation {
  kmTraveled: number;
  source: KmCalcSource;
  pointsUsed: number;
}

/**
 * Computes km traveled by a trip for fuel adjustment prorating.
 *
 * Preferred: integrated Haversine over filtered trip_location_history.
 * Fallback: linear Haversine from origin to last known position (or snapshot origin).
 * Last resort: 0 km (log warning).
 *
 * Point filtering (see ADR-011):
 *  - accuracy_m <= 100
 *  - speed_kmh <= 140 (physically plausible for truck)
 *  - drop if gap > 5 min AND distance > 10 km (teleport = GPS error)
 */
@Injectable()
export class KmCalculatorService {
  private readonly logger = new Logger(KmCalculatorService.name);
  private static readonly EARTH_RADIUS_KM = 6371;
  private static readonly MAX_ACCURACY_M = 100;
  private static readonly MAX_SPEED_KMH = 140;
  /** Implicit speed threshold for teleport detection (physically impossible). */
  private static readonly MAX_IMPLICIT_SPEED_KMH = 200;

  constructor(
    @InjectRepository(TripLocationHistory)
    private readonly locationRepo: Repository<TripLocationHistory>,
  ) {}

  async calcKmTraveled(
    tripId: string,
    fallbackOrigin?: LatLng,
  ): Promise<KmCalculation> {
    const points = await this.locationRepo.find({
      where: { tripId },
      order: { recordedAt: 'ASC' },
    });

    const filtered = this.filterPoints(points);

    if (filtered.length >= 2) {
      const km = this.integrateHaversine(filtered);
      return {
        kmTraveled: km,
        source: 'gps_tracklog',
        pointsUsed: filtered.length,
      };
    }

    if (filtered.length === 1 && fallbackOrigin) {
      const km = this.haversine(fallbackOrigin, {
        latitude: Number(filtered[0].latitude),
        longitude: Number(filtered[0].longitude),
      });
      this.logger.warn(
        `Only 1 GPS point for trip ${tripId}; using linear haversine from origin`,
      );
      return { kmTraveled: km, source: 'haversine_linear', pointsUsed: 1 };
    }

    this.logger.warn(
      `No valid GPS points for trip ${tripId}; returning 0 km (will be prorated conservatively)`,
    );
    return { kmTraveled: 0, source: 'unavailable', pointsUsed: 0 };
  }

  private filterPoints(points: TripLocationHistory[]): TripLocationHistory[] {
    const result: TripLocationHistory[] = [];

    for (const p of points) {
      // accuracy filter
      if (p.accuracyM != null && Number(p.accuracyM) > KmCalculatorService.MAX_ACCURACY_M) {
        continue;
      }
      // speed sanity filter
      if (p.speedKmh != null && Number(p.speedKmh) > KmCalculatorService.MAX_SPEED_KMH) {
        continue;
      }

      // teleport filter — implicit speed between previous and current point
      // must be physically plausible (≤ 200 km/h for heavy trucks)
      if (result.length > 0) {
        const prev = result[result.length - 1];
        const dtHours =
          (p.recordedAt.getTime() - prev.recordedAt.getTime()) / 3_600_000;
        if (dtHours > 0) {
          const dKm = this.haversine(
            { latitude: Number(prev.latitude), longitude: Number(prev.longitude) },
            { latitude: Number(p.latitude), longitude: Number(p.longitude) },
          );
          const implicitSpeed = dKm / dtHours;
          if (implicitSpeed > KmCalculatorService.MAX_IMPLICIT_SPEED_KMH) {
            continue;
          }
        }
      }

      result.push(p);
    }

    return result;
  }

  private integrateHaversine(points: TripLocationHistory[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += this.haversine(
        {
          latitude: Number(points[i - 1].latitude),
          longitude: Number(points[i - 1].longitude),
        },
        {
          latitude: Number(points[i].latitude),
          longitude: Number(points[i].longitude),
        },
      );
    }
    return total;
  }

  /** Haversine distance in km between two lat/lng points */
  haversine(a: LatLng, b: LatLng): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * KmCalculatorService.EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
  }
}
