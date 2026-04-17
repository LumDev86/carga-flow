import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';
import { FuelPriceHistory } from '../entities/fuel-price-history.entity';
import { TripFuelSnapshot } from '../entities/trip-fuel-snapshot.entity';
import { TripStatus } from '../../../shared/enums/trip-status.enum';
import { FuelType } from '../../../shared/enums/fuel-type.enum';
import { PricingMode } from '../../../shared/enums/pricing-mode.enum';
import { FuelAdjustmentService } from './fuel-adjustment.service';
import { AdjustmentPolicyResolver } from '../policies/adjustment-policy';
import { FeatureFlagService } from './feature-flag.service';
import { FuelPriceQueryService } from './fuel-price-query.service';
import { RedisLockService } from './redis-lock.service';
import { FuelNotificationService } from './fuel-notification.service';

export interface PriceChangedEventPayload {
  priceHistoryId: string;
  fuelType: FuelType;
  oldPrice: number | null;
  newPrice: number;
  pctChange: number | null;
  effectiveFrom: string;
  source: string;
  registeredBy: string;
}

export interface RecalcResult {
  candidateTripsCount: number;
  adjustmentsCreated: number;
  skippedGraceWindow: number;
  skippedOther: number;
  locksSkipped: number;
  errors: number;
}

/**
 * Orchestrates recalculation of active trips after a fuel price change.
 * Invoked by the worker (FASE 1.4). See ADR-003, ADR-009.
 *
 * For each candidate trip (ASSIGNED/ACCEPTED/IN_TRANSIT + REALTIME + has snapshot):
 *   1. Check rollout (user in feature flag cohort)
 *   2. Acquire Redis lock
 *   3. tryCreateAdjustment (grace window / policy / calc)
 *   4. Release lock
 */
@Injectable()
export class FuelTrackingRecalcService {
  private readonly logger = new Logger(FuelTrackingRecalcService.name);
  private static readonly TRIP_RECALC_PARALLELISM = 5;
  private static readonly LOCK_TTL_MS = 10_000;

  constructor(
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
    @InjectRepository(FuelPriceHistory)
    private readonly priceRepo: Repository<FuelPriceHistory>,
    @InjectRepository(TripFuelSnapshot)
    private readonly snapRepo: Repository<TripFuelSnapshot>,
    private readonly adjustmentService: FuelAdjustmentService,
    private readonly policyResolver: AdjustmentPolicyResolver,
    private readonly featureFlags: FeatureFlagService,
    private readonly priceQuery: FuelPriceQueryService,
    private readonly lockService: RedisLockService,
    private readonly notifier: FuelNotificationService,
  ) {}

  async recalculateForPriceChange(
    payload: PriceChangedEventPayload,
  ): Promise<RecalcResult> {
    const result: RecalcResult = {
      candidateTripsCount: 0,
      adjustmentsCreated: 0,
      skippedGraceWindow: 0,
      skippedOther: 0,
      locksSkipped: 0,
      errors: 0,
    };

    // Feature flag gate
    const trackingEnabled = await this.featureFlags.isEnabled(
      'FUEL_TRACKING_ENABLED',
    );
    if (!trackingEnabled) {
      this.logger.log(
        `FUEL_TRACKING_ENABLED=false; skipping recalc for price ${payload.priceHistoryId}`,
      );
      return result;
    }

    // If oldPrice was unknown (first ever price), nothing to compare
    if (payload.oldPrice == null) {
      this.logger.log(
        `First price entry for ${payload.fuelType}; no recalc needed`,
      );
      return result;
    }

    const autoApplyEnabled = await this.featureFlags.isEnabled(
      'FUEL_AUTO_APPLY_ENABLED',
    );
    const thresholds = await this.policyResolver.getThresholds();

    // Find candidate trips: active + REALTIME + has snapshot + fuel_type matches
    const candidates = await this.tripRepo
      .createQueryBuilder('t')
      .innerJoin(
        TripFuelSnapshot,
        'snap',
        'snap.trip_id = t.id AND snap.fuel_type = :fuelType',
        { fuelType: payload.fuelType },
      )
      .where('t.status IN (:...statuses)', {
        statuses: [
          TripStatus.ASSIGNED,
          TripStatus.ACCEPTED,
          TripStatus.IN_TRANSIT,
        ],
      })
      .andWhere('t.pricingMode = :mode', { mode: PricingMode.REALTIME })
      .andWhere('t.fuelSnapshotId IS NOT NULL')
      .getMany();

    result.candidateTripsCount = candidates.length;
    this.logger.log(
      `Recalc for price ${payload.priceHistoryId}: ${candidates.length} candidate trips`,
    );

    // Invalidate current-price cache so next read reflects new state
    await this.priceQuery.invalidateCurrentCache(payload.fuelType);

    // Broadcast the price update globally (UI banners, charts)
    this.notifier.notifyPriceUpdated({
      fuelType: payload.fuelType,
      oldPrice: payload.oldPrice,
      newPrice: payload.newPrice,
      pctChange: payload.pctChange,
      effectiveFrom: payload.effectiveFrom,
    });

    // Process in bounded parallelism
    const chunks = this.chunk(candidates, FuelTrackingRecalcService.TRIP_RECALC_PARALLELISM);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (trip) => {
          try {
            const inRollout = await this.featureFlags.isUserInRollout(
              trip.requesterId,
              'FUEL_ROLLOUT_PCT',
            );
            if (!inRollout) {
              result.skippedOther++;
              return;
            }

            const lockKey = `fuel:recalc:trip:${trip.id}`;
            const acquired = await this.lockService.acquire(
              lockKey,
              FuelTrackingRecalcService.LOCK_TTL_MS,
            );
            if (!acquired) {
              result.locksSkipped++;
              return;
            }

            try {
              const adjustment = await this.adjustmentService.tryCreateAdjustment(
                trip,
                {
                  priceHistoryId: payload.priceHistoryId,
                  fuelType: payload.fuelType,
                  oldPrice: payload.oldPrice,
                  newPrice: payload.newPrice,
                },
                thresholds,
                autoApplyEnabled,
              );
              if (adjustment) {
                result.adjustmentsCreated++;
                this.notifier.notifyAdjustment(
                  adjustment,
                  trip.requesterId,
                  trip.driverId,
                );
              } else {
                result.skippedOther++;
              }
            } finally {
              await this.lockService.release(lockKey);
            }
          } catch (err) {
            result.errors++;
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(
              `Recalc failed for trip ${trip.id}: ${msg}`,
              err instanceof Error ? err.stack : undefined,
            );
          }
        }),
      );
    }

    this.logger.log(
      `Recalc complete for ${payload.priceHistoryId}: ${JSON.stringify(result)}`,
    );
    return result;
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }
}
