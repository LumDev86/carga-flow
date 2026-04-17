import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FuelPriceHistory } from '../entities/fuel-price-history.entity';
import { TripFuelSnapshot } from '../entities/trip-fuel-snapshot.entity';
import { Trip } from '../../trips/entities/trip.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { FuelType } from '../../../shared/enums/fuel-type.enum';
import { VehicleConsumptionService } from './vehicle-consumption.service';
import { AdjustmentPolicyResolver } from '../policies/adjustment-policy';

/**
 * Creates and reads immutable fuel snapshots per trip.
 * Invoked from the trip lifecycle when a trip is accepted by a driver.
 * See ADR-001, SEQUENCES.md §4.
 */
@Injectable()
export class FuelSnapshotService {
  private readonly logger = new Logger(FuelSnapshotService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(TripFuelSnapshot)
    private readonly snapshotRepo: Repository<TripFuelSnapshot>,
    @InjectRepository(FuelPriceHistory)
    private readonly priceRepo: Repository<FuelPriceHistory>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
    private readonly consumptionService: VehicleConsumptionService,
    private readonly policyResolver: AdjustmentPolicyResolver,
  ) {}

  /**
   * Creates a snapshot for the given trip. Idempotent — if a snapshot
   * already exists for the trip, returns it without modification.
   */
  async createSnapshot(
    tripId: string,
    vehicleId: string,
  ): Promise<TripFuelSnapshot> {
    const existing = await this.snapshotRepo.findOne({ where: { tripId } });
    if (existing) {
      this.logger.log(
        `Snapshot already exists for trip ${tripId}; skipping creation`,
      );
      return existing;
    }

    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);

    const vehicle = await this.vehicleRepo.findOne({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException(`Vehicle ${vehicleId} not found`);

    const consumption = await this.consumptionService.resolve(vehicle);

    const fuelType: FuelType = vehicle.fuelType ?? FuelType.COMUN;
    const priceRow = await this.getCurrentPrice(fuelType);
    if (!priceRow) {
      throw new Error(
        `No fuel_price_history entry for type=${fuelType}. Seed the initial price before enabling fuel tracking.`,
      );
    }

    const estimatedTotalKm = Number(trip.distanceKm ?? 0);
    const estimatedTotalLiters =
      (estimatedTotalKm * consumption.litersPer100Km) / 100;

    const thresholds = await this.policyResolver.getThresholds();

    // Write snapshot + link trip in same TX
    return await this.dataSource.transaction(async (manager) => {
      const snapshotRepo = manager.getRepository(TripFuelSnapshot);
      const tripRepo = manager.getRepository(Trip);

      const snapshot = snapshotRepo.create({
        tripId,
        fuelType,
        initialPricePerLiter: priceRow.pricePerLiter,
        initialPriceHistoryId: priceRow.id,
        vehicleFuelConsumption: consumption.litersPer100Km.toFixed(2),
        estimatedTotalKm: estimatedTotalKm.toFixed(2),
        estimatedTotalLiters: estimatedTotalLiters.toFixed(2),
        configSnapshot: {
          consumption_source: consumption.source,
          consumption_source_detail: consumption.sourceDetail,
          thresholds,
          price_history_ref: {
            id: priceRow.id,
            effectiveFrom: priceRow.effectiveFrom,
          },
          vehicle_id: vehicleId,
          created_at: new Date().toISOString(),
        },
      });

      const saved = await snapshotRepo.save(snapshot);
      await tripRepo.update(tripId, { fuelSnapshotId: saved.id });

      this.logger.log(
        `Snapshot created for trip ${tripId}: price=${priceRow.pricePerLiter} ` +
          `consumption=${consumption.litersPer100Km} (${consumption.source}) ` +
          `estKm=${estimatedTotalKm}`,
      );

      return saved;
    });
  }

  async getByTripId(tripId: string): Promise<TripFuelSnapshot | null> {
    return this.snapshotRepo.findOne({ where: { tripId } });
  }

  private async getCurrentPrice(
    fuelType: FuelType,
  ): Promise<FuelPriceHistory | null> {
    return this.priceRepo
      .createQueryBuilder('h')
      .where('h.fuelType = :fuelType', { fuelType })
      .andWhere('h.effectiveFrom <= :now', { now: new Date() })
      .orderBy('h.effectiveFrom', 'DESC')
      .limit(1)
      .getOne();
  }
}
