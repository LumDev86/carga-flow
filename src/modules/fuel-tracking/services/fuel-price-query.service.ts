import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { FuelPriceHistory } from '../entities/fuel-price-history.entity';
import { Trip } from '../../trips/entities/trip.entity';
import { TripStatus } from '../../../shared/enums/trip-status.enum';
import { FuelType } from '../../../shared/enums/fuel-type.enum';
import { PricingMode } from '../../../shared/enums/pricing-mode.enum';

export interface FuelPriceCurrent {
  fuelType: FuelType;
  pricePerLiter: number;
  effectiveFrom: Date;
  source: string;
  sourceRef: string | null;
  historyId: string;
}

export interface FuelPriceTrendPoint {
  date: string; // YYYY-MM-DD
  pricePerLiter: number;
}

export interface ListHistoryOptions {
  fuelType?: FuelType;
  from?: Date;
  to?: Date;
  source?: string;
  page?: number;
  limit?: number;
}

export interface ImpactSimulation {
  currentPrice: number;
  proposedPrice: number;
  pctChange: number;
  affectedTrips: {
    total: number;
    byPolicy: { SILENT: number; INFORMATIVE: number; EXPLICIT: number };
  };
  estimatedAdjustment: {
    total: number;
    avgPerTrip: number;
    minPerTrip: number;
    maxPerTrip: number;
  };
}

/**
 * Read side for fuel price data. Cached aggressively (30s TTL).
 * See ADR-002, API.md §4.
 */
@Injectable()
export class FuelPriceQueryService {
  private readonly logger = new Logger(FuelPriceQueryService.name);
  private static readonly TTL_MS = 30_000;
  private static readonly CURRENT_CACHE_KEY = (t: FuelType) => `fuel:current:${t}`;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @InjectRepository(FuelPriceHistory)
    private readonly historyRepo: Repository<FuelPriceHistory>,
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
  ) {}

  async getCurrent(fuelType: FuelType): Promise<FuelPriceCurrent | null> {
    const cacheKey = FuelPriceQueryService.CURRENT_CACHE_KEY(fuelType);
    const cached = await this.cache.get<FuelPriceCurrent>(cacheKey);
    if (cached) return cached;

    const row = await this.historyRepo
      .createQueryBuilder('h')
      .where('h.fuelType = :fuelType', { fuelType })
      .andWhere('h.effectiveFrom <= :now', { now: new Date() })
      .orderBy('h.effectiveFrom', 'DESC')
      .limit(1)
      .getOne();

    if (!row) return null;

    const result: FuelPriceCurrent = {
      fuelType: row.fuelType,
      pricePerLiter: Number(row.pricePerLiter),
      effectiveFrom: row.effectiveFrom,
      source: row.source,
      sourceRef: row.sourceRef,
      historyId: row.id,
    };
    await this.cache.set(cacheKey, result, FuelPriceQueryService.TTL_MS);
    return result;
  }

  /** Invalidates cache entry — called after a price change. */
  async invalidateCurrentCache(fuelType: FuelType): Promise<void> {
    await this.cache.del(FuelPriceQueryService.CURRENT_CACHE_KEY(fuelType));
  }

  async getTrend(
    fuelType: FuelType,
    days = 7,
  ): Promise<FuelPriceTrendPoint[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await this.historyRepo
      .createQueryBuilder('h')
      .select('DATE_TRUNC(\'day\', h.effectiveFrom)', 'day')
      .addSelect('AVG(h.pricePerLiter)', 'avg_price')
      .where('h.fuelType = :fuelType', { fuelType })
      .andWhere('h.effectiveFrom >= :since', { since })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: Date; avg_price: string }>();

    return rows.map((r) => ({
      date: new Date(r.day).toISOString().slice(0, 10),
      pricePerLiter: Number(r.avg_price),
    }));
  }

  async listHistory(
    opts: ListHistoryOptions,
  ): Promise<{ items: FuelPriceHistory[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

    const qb = this.historyRepo
      .createQueryBuilder('h')
      .leftJoinAndSelect('h.creator', 'creator')
      .orderBy('h.effectiveFrom', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (opts.fuelType) qb.andWhere('h.fuelType = :ft', { ft: opts.fuelType });
    if (opts.source) qb.andWhere('h.source = :src', { src: opts.source });
    if (opts.from && opts.to) {
      qb.andWhere('h.effectiveFrom BETWEEN :from AND :to', {
        from: opts.from,
        to: opts.to,
      });
    } else if (opts.from) {
      qb.andWhere('h.effectiveFrom >= :from', { from: opts.from });
    } else if (opts.to) {
      qb.andWhere('h.effectiveFrom <= :to', { to: opts.to });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  /**
   * Simulates the impact of a proposed price change without committing.
   * Used by CRM admin "Impact preview".
   */
  async simulateImpact(
    fuelType: FuelType,
    proposedPrice: number,
  ): Promise<ImpactSimulation> {
    const current = await this.getCurrent(fuelType);
    const currentPrice = current?.pricePerLiter ?? 0;
    const pctChange =
      currentPrice > 0 ? (proposedPrice - currentPrice) / currentPrice : 0;
    const absPct = Math.abs(pctChange);

    // Active trips with pricing_mode REALTIME and the given fuel_type
    const activeTrips = await this.tripRepo
      .createQueryBuilder('t')
      .where('t.status IN (:...statuses)', {
        statuses: [TripStatus.ASSIGNED, TripStatus.ACCEPTED, TripStatus.IN_TRANSIT],
      })
      .andWhere('t.pricingMode = :mode', { mode: PricingMode.REALTIME })
      .andWhere('t.fuelSnapshotId IS NOT NULL')
      .getMany();

    // Classify by policy (we need thresholds; simplified here, caller can inject real thresholds)
    // For impact preview, we use defaults silent=0.03, explicit=0.10
    const silentPct = 0.03;
    const explicitPct = 0.1;
    const policy =
      absPct <= silentPct ? 'SILENT' : absPct <= explicitPct ? 'INFORMATIVE' : 'EXPLICIT';

    // Estimate adjustment per trip — we approximate with estimated_total_liters × delta_price
    // Real recalc uses km_remaining, but for preview this upper-bound is acceptable
    // Note: we read estimated_total_liters from the snapshot; join for simplicity using raw query
    const snapshotRows = await this.tripRepo.manager.query<Array<{
      liters_remaining_estimate: string;
    }>>(
      `
      SELECT s.estimated_total_liters AS liters_remaining_estimate
      FROM trip_fuel_snapshots s
      JOIN trips t ON t.fuel_snapshot_id = s.id
      WHERE t.status IN ('ASSIGNED','ACCEPTED','IN_TRANSIT')
        AND t.pricing_mode = 'REALTIME'
        AND s.fuel_type = $1
      `,
      [fuelType],
    );

    const deltaPrice = proposedPrice - currentPrice;
    const perTripAmounts = snapshotRows.map(
      (r) => Number(r.liters_remaining_estimate) * deltaPrice,
    );
    const total = perTripAmounts.reduce((a, b) => a + b, 0);
    const avg = perTripAmounts.length ? total / perTripAmounts.length : 0;
    const min = perTripAmounts.length ? Math.min(...perTripAmounts) : 0;
    const max = perTripAmounts.length ? Math.max(...perTripAmounts) : 0;

    return {
      currentPrice,
      proposedPrice,
      pctChange,
      affectedTrips: {
        total: activeTrips.length,
        byPolicy: {
          SILENT: policy === 'SILENT' ? activeTrips.length : 0,
          INFORMATIVE: policy === 'INFORMATIVE' ? activeTrips.length : 0,
          EXPLICIT: policy === 'EXPLICIT' ? activeTrips.length : 0,
        },
      },
      estimatedAdjustment: {
        total: Math.round(total * 100) / 100,
        avgPerTrip: Math.round(avg * 100) / 100,
        minPerTrip: Math.round(min * 100) / 100,
        maxPerTrip: Math.round(max * 100) / 100,
      },
    };
  }

  async getPriceAt(fuelType: FuelType, at: Date): Promise<FuelPriceHistory | null> {
    return this.historyRepo
      .createQueryBuilder('h')
      .where('h.fuelType = :fuelType', { fuelType })
      .andWhere('h.effectiveFrom <= :at', { at })
      .orderBy('h.effectiveFrom', 'DESC')
      .limit(1)
      .getOne();
  }
}
