import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventsGateway } from '../../events/events.gateway';
import { TripFuelAdjustment } from '../entities/trip-fuel-adjustment.entity';
import { TripFuelSnapshot } from '../entities/trip-fuel-snapshot.entity';
import { AdjustmentPolicy } from '../../../shared/enums/adjustment-policy.enum';
import { AdjustmentStatus } from '../../../shared/enums/adjustment-status.enum';

/**
 * Emits WebSocket events for fuel tracking state changes.
 *
 * Event names (see API.md §5):
 *   fuel_price:updated
 *   trip:fuel_snapshot_created
 *   trip:fuel_adjustment_proposed
 *   trip:fuel_adjustment_applied
 *   trip:fuel_adjustment_rejected
 *   trip:fuel_adjustment_expired
 */
@Injectable()
export class FuelNotificationService {
  private readonly logger = new Logger(FuelNotificationService.name);

  constructor(
    @Optional() private readonly eventsGateway: EventsGateway | null,
  ) {}

  notifyPriceUpdated(payload: {
    fuelType: string;
    oldPrice: number | null;
    newPrice: number;
    pctChange: number | null;
    effectiveFrom: string;
  }): void {
    this.eventsGateway?.server?.emit('fuel_price:updated', payload);
  }

  notifySnapshotCreated(
    tripId: string,
    snapshot: TripFuelSnapshot,
    dadorId: string,
    driverId: string | null,
  ): void {
    const payload = { tripId, snapshot };
    this.eventsGateway?.emitTripUpdate(tripId, 'trip:fuel_snapshot_created', payload);
    this.eventsGateway?.emitToUser(dadorId, 'trip:fuel_snapshot_created', payload);
    if (driverId) {
      this.eventsGateway?.emitToUser(driverId, 'trip:fuel_snapshot_created', payload);
    }
  }

  notifyAdjustment(
    adjustment: TripFuelAdjustment,
    dadorId: string,
    driverId: string | null,
  ): void {
    const event = this.eventNameFor(adjustment);
    if (!event) return;

    const payload = {
      tripId: adjustment.tripId,
      adjustmentId: adjustment.id,
      status: adjustment.status,
      policy: adjustment.policyApplied,
      amount: Number(adjustment.adjustmentAmount),
      oldPrice: Number(adjustment.oldPrice),
      newPrice: Number(adjustment.newPrice),
      pctChange: Number(adjustment.pctChange),
      autoApplyDeadline: adjustment.autoApplyDeadline,
    };

    this.eventsGateway?.emitTripUpdate(adjustment.tripId, event, payload);

    // Silent policy: do NOT push to dador (ADR-004)
    if (adjustment.policyApplied !== AdjustmentPolicy.SILENT) {
      this.eventsGateway?.emitToUser(dadorId, event, payload);
    }
    if (driverId) {
      this.eventsGateway?.emitToUser(driverId, event, payload);
    }
  }

  private eventNameFor(adjustment: TripFuelAdjustment): string | null {
    switch (adjustment.status) {
      case AdjustmentStatus.PROPOSED:
        return 'trip:fuel_adjustment_proposed';
      case AdjustmentStatus.AUTO_APPLIED:
      case AdjustmentStatus.ACCEPTED:
        return 'trip:fuel_adjustment_applied';
      case AdjustmentStatus.REJECTED:
        return 'trip:fuel_adjustment_rejected';
      case AdjustmentStatus.EXPIRED:
        return 'trip:fuel_adjustment_expired';
      default:
        return null;
    }
  }
}
