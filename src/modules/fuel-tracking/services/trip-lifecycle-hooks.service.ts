import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { VehicleStatus } from '../../../shared/enums/vehicle-status.enum';
import { FuelSnapshotService } from './fuel-snapshot.service';
import { FuelAdjustmentService } from './fuel-adjustment.service';
import { FuelNotificationService } from './fuel-notification.service';
import { FeatureFlagService } from './feature-flag.service';
import { AdjustmentPolicyResolver } from '../policies/adjustment-policy';
import { PricingMode } from '../../../shared/enums/pricing-mode.enum';

/**
 * Bridge service called by TripsService on status transitions.
 *
 * Lifecycle:
 *   onTripAccepted(tripId, driverId) → create snapshot (if conditions met)
 *   onTripDelivered(tripId)          → finalize actual_fuel_cost, expire PROPOSED
 *   onTripCancelled(tripId)          → expire all PROPOSED
 *
 * All methods are best-effort: they log and swallow errors so they don't
 * break the core trip flow. See docs/fuel-tracking/SEQUENCES.md §4, §5.
 */
@Injectable()
export class TripLifecycleHooksService {
  private readonly logger = new Logger(TripLifecycleHooksService.name);

  constructor(
    @InjectRepository(Vehicle) private readonly vehicleRepo: Repository<Vehicle>,
    private readonly snapshotService: FuelSnapshotService,
    private readonly adjustmentService: FuelAdjustmentService,
    private readonly featureFlags: FeatureFlagService,
    private readonly policyResolver: AdjustmentPolicyResolver,
    private readonly notifier: FuelNotificationService,
  ) {}

  async onTripAccepted(params: {
    tripId: string;
    driverId: string;
    requesterId: string;
    pricingMode: PricingMode;
    distanceKm: number | null;
  }): Promise<void> {
    try {
      // Gate 1: feature enabled
      if (!(await this.featureFlags.isEnabled('FUEL_TRACKING_ENABLED'))) {
        return;
      }

      // Gate 2: trip is REALTIME
      if (params.pricingMode !== PricingMode.REALTIME) {
        return;
      }

      // Gate 3: distance exceeds min for realtime (defensive — createTrip also
      // handles this, but in case a REALTIME trip was created programmatically)
      const thresholds = await this.policyResolver.getThresholds();
      if (
        params.distanceKm != null &&
        Number(params.distanceKm) < thresholds.realtimeMinDistanceKm
      ) {
        this.logger.debug(
          `Trip ${params.tripId} distance below realtime min; skip snapshot`,
        );
        return;
      }

      // Gate 4: requester is in rollout cohort
      if (
        !(await this.featureFlags.isUserInRollout(
          params.requesterId,
          'FUEL_ROLLOUT_PCT',
        ))
      ) {
        this.logger.debug(
          `Requester ${params.requesterId} not in rollout; skip snapshot`,
        );
        return;
      }

      // Resolve primary approved vehicle of the driver
      const vehicle = await this.vehicleRepo.findOne({
        where: {
          userId: params.driverId,
          approvalStatus: VehicleStatus.APPROVED,
          isActive: true,
        },
      });

      if (!vehicle) {
        this.logger.warn(
          `No approved active vehicle found for driver ${params.driverId}; skip snapshot`,
        );
        return;
      }

      const snapshot = await this.snapshotService.createSnapshot(
        params.tripId,
        vehicle.id,
      );

      this.notifier.notifySnapshotCreated(
        params.tripId,
        snapshot,
        params.requesterId,
        params.driverId,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `onTripAccepted failed for trip ${params.tripId}: ${msg}`,
        err instanceof Error ? err.stack : undefined,
      );
      // swallow
    }
  }

  async onTripDelivered(tripId: string): Promise<void> {
    try {
      if (!(await this.featureFlags.isEnabled('FUEL_TRACKING_ENABLED'))) {
        return;
      }
      await this.adjustmentService.finalizeTripFuelCost(tripId);
      this.logger.log(`Finalized fuel cost for trip ${tripId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `onTripDelivered failed for trip ${tripId}: ${msg}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  async onTripCancelled(tripId: string): Promise<void> {
    try {
      if (!(await this.featureFlags.isEnabled('FUEL_TRACKING_ENABLED'))) {
        return;
      }
      const n = await this.adjustmentService.expirePendingForTrip(tripId);
      if (n > 0) {
        this.logger.log(
          `Expired ${n} PROPOSED adjustment(s) for cancelled trip ${tripId}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `onTripCancelled failed for trip ${tripId}: ${msg}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
