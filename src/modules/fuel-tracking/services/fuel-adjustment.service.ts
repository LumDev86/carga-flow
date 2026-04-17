import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, QueryFailedError, In } from 'typeorm';
import { TripFuelAdjustment } from '../entities/trip-fuel-adjustment.entity';
import { TripFuelSnapshot } from '../entities/trip-fuel-snapshot.entity';
import { FuelPriceHistory } from '../entities/fuel-price-history.entity';
import { Trip } from '../../trips/entities/trip.entity';
import { AdjustmentStatus } from '../../../shared/enums/adjustment-status.enum';
import { AdjustmentPolicy } from '../../../shared/enums/adjustment-policy.enum';
import { TripStatus } from '../../../shared/enums/trip-status.enum';
import { KmCalculatorService } from './km-calculator.service';
import {
  AdjustmentPolicyResolver,
  PolicyThresholds,
} from '../policies/adjustment-policy';

export interface CreateAdjustmentInput {
  tripId: string;
  snapshotId: string;
  triggeringPriceHistoryId: string;
  oldPrice: number;
  newPrice: number;
  kmTraveledAtTrigger: number;
}

export interface RecalcInput {
  priceHistoryId: string;
  fuelType: string;
  newPrice: number;
  oldPrice: number | null;
}

/**
 * Core service for creating and responding to fuel adjustments.
 * See ADR-001 (calculation), ADR-004 (policy), ADR-006 (symmetric),
 * ADR-009 (locks + UNIQUE constraint defense).
 */
@Injectable()
export class FuelAdjustmentService {
  private readonly logger = new Logger(FuelAdjustmentService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(TripFuelAdjustment)
    private readonly adjustmentRepo: Repository<TripFuelAdjustment>,
    @InjectRepository(TripFuelSnapshot)
    private readonly snapshotRepo: Repository<TripFuelSnapshot>,
    @InjectRepository(FuelPriceHistory)
    private readonly priceRepo: Repository<FuelPriceHistory>,
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
    private readonly kmCalc: KmCalculatorService,
    private readonly policyResolver: AdjustmentPolicyResolver,
  ) {}

  /**
   * Attempts to create an adjustment for a trip given a price change.
   * Returns the adjustment, or null if the trip was skipped (grace window,
   * no snapshot, already processed, etc.). Never throws for expected skips.
   */
  async tryCreateAdjustment(
    trip: Trip,
    input: RecalcInput,
    thresholds: PolicyThresholds,
    autoApplyEnabled: boolean,
  ): Promise<TripFuelAdjustment | null> {
    // Precondition: previous price known
    if (input.oldPrice == null) {
      this.logger.debug(
        `Skip trip ${trip.id}: no previous price to compare against (first price entry)`,
      );
      return null;
    }
    const oldPrice: number = input.oldPrice;

    // Precondition: snapshot exists
    if (!trip.fuelSnapshotId) {
      this.logger.debug(
        `Trip ${trip.id} has no snapshot; skip (likely created pre-feature)`,
      );
      return null;
    }

    // Precondition: trip still active
    const activeStatuses = [
      TripStatus.ASSIGNED,
      TripStatus.ACCEPTED,
      TripStatus.IN_TRANSIT,
    ];
    if (!activeStatuses.includes(trip.status)) {
      this.logger.debug(
        `Trip ${trip.id} status=${trip.status} is not active; skip`,
      );
      return null;
    }

    // Grace window check
    if (
      this.policyResolver.isWithinGraceWindow(
        trip.acceptedAt,
        thresholds.graceWindowMinutes,
      )
    ) {
      this.logger.debug(
        `Trip ${trip.id} within grace window (${thresholds.graceWindowMinutes}min); skip`,
      );
      return null;
    }

    // Load snapshot
    const snapshot = await this.snapshotRepo.findOne({
      where: { id: trip.fuelSnapshotId },
    });
    if (!snapshot) {
      this.logger.warn(
        `Trip ${trip.id} references missing snapshot ${trip.fuelSnapshotId}`,
      );
      return null;
    }

    const consumption = Number(snapshot.vehicleFuelConsumption);
    const estimatedTotalKm = Number(snapshot.estimatedTotalKm);

    // Compute km traveled (best effort)
    const kmCalc = await this.kmCalc.calcKmTraveled(trip.id);
    const kmTraveled = Math.min(kmCalc.kmTraveled, estimatedTotalKm);
    const kmRemaining = Math.max(0, estimatedTotalKm - kmTraveled);
    const litersRemaining = (kmRemaining * consumption) / 100;

    // Compute adjustment amount: sign preserved (negative when price drops)
    const adjustmentAmount = litersRemaining * (input.newPrice - oldPrice);

    // If km remaining is ~0, skip (trip essentially complete)
    if (kmRemaining < 1) {
      this.logger.debug(
        `Trip ${trip.id} has <1km remaining; skip adjustment`,
      );
      return null;
    }

    const pctChangeAbs = Math.abs(
      (input.newPrice - oldPrice) / (oldPrice || 1),
    );
    const pctChangeSigned = (input.newPrice - oldPrice) / (oldPrice || 1);
    const policy = this.policyResolver.resolvePolicy(pctChangeAbs, thresholds);

    // Status depends on policy + feature flag
    // If auto_apply_enabled=false: everything is PROPOSED (requires accept)
    let status: AdjustmentStatus;
    let autoApplyDeadline: Date | null = null;

    if (!autoApplyEnabled) {
      status = AdjustmentStatus.PROPOSED;
    } else {
      switch (policy) {
        case AdjustmentPolicy.SILENT:
          status = AdjustmentStatus.AUTO_APPLIED;
          break;
        case AdjustmentPolicy.INFORMATIVE:
          status = AdjustmentStatus.AUTO_APPLIED;
          autoApplyDeadline = new Date(
            Date.now() + thresholds.autoApplyDeadlineHours * 3600 * 1000,
          );
          break;
        case AdjustmentPolicy.EXPLICIT:
          status = AdjustmentStatus.PROPOSED;
          autoApplyDeadline = null;
          break;
      }
    }

    // Defense in depth: UNIQUE (trip_id, triggering_price_history_id) catches duplicates
    try {
      return await this.dataSource.transaction(async (manager) => {
        const adjRepo = manager.getRepository(TripFuelAdjustment);
        const tripRepoTx = manager.getRepository(Trip);

        const adjustment = adjRepo.create({
          tripId: trip.id,
          snapshotId: snapshot.id,
          triggeringPriceHistoryId: input.priceHistoryId,
          oldPrice: oldPrice.toFixed(2),
          newPrice: input.newPrice.toFixed(2),
          pctChange: pctChangeSigned.toFixed(4),
          kmTraveledAtTrigger: kmTraveled.toFixed(2),
          kmRemainingAtTrigger: kmRemaining.toFixed(2),
          litersRemaining: litersRemaining.toFixed(2),
          adjustmentAmount: adjustmentAmount.toFixed(2),
          status,
          policyApplied: policy,
          autoApplyDeadline,
        });

        const saved = await adjRepo.save(adjustment);

        // If auto-applied, bump trip total
        if (status === AdjustmentStatus.AUTO_APPLIED) {
          await this.applyAdjustmentToTrip(tripRepoTx, trip.id, adjustmentAmount);
        }

        this.logger.log(
          `Adjustment ${saved.id} created for trip ${trip.id}: ` +
            `amount=${adjustmentAmount.toFixed(2)} pct=${(pctChangeSigned * 100).toFixed(2)}% ` +
            `policy=${policy} status=${status} kmSource=${kmCalc.source}`,
        );

        return saved;
      });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as unknown as { code?: string }).code === '23505'
      ) {
        this.logger.warn(
          `Duplicate adjustment for trip=${trip.id} price=${input.priceHistoryId} caught by UNIQUE constraint`,
        );
        return null;
      }
      throw err;
    }
  }

  /**
   * Dador accepts a PROPOSED adjustment (or reverts a rejection of AUTO_APPLIED
   * within deadline). Uses UPDATE WHERE status in (...) for idempotency.
   */
  async acceptAdjustment(
    adjustmentId: string,
    dadorUserId: string,
  ): Promise<TripFuelAdjustment> {
    return this.respondAdjustment(
      adjustmentId,
      dadorUserId,
      AdjustmentStatus.ACCEPTED,
      null,
    );
  }

  async rejectAdjustment(
    adjustmentId: string,
    dadorUserId: string,
    reason: string,
  ): Promise<TripFuelAdjustment> {
    return this.respondAdjustment(
      adjustmentId,
      dadorUserId,
      AdjustmentStatus.REJECTED,
      reason,
    );
  }

  /**
   * Expires all PROPOSED adjustments of a trip (e.g., on DELIVERED/CANCELLED).
   */
  async expirePendingForTrip(tripId: string): Promise<number> {
    const result = await this.adjustmentRepo
      .createQueryBuilder()
      .update()
      .set({ status: AdjustmentStatus.EXPIRED })
      .where('tripId = :tripId', { tripId })
      .andWhere('status = :status', { status: AdjustmentStatus.PROPOSED })
      .execute();
    return result.affected ?? 0;
  }

  private async respondAdjustment(
    adjustmentId: string,
    dadorUserId: string,
    newStatus: AdjustmentStatus.ACCEPTED | AdjustmentStatus.REJECTED,
    reason: string | null,
  ): Promise<TripFuelAdjustment> {
    return await this.dataSource.transaction(async (manager) => {
      const adjRepo = manager.getRepository(TripFuelAdjustment);
      const tripRepoTx = manager.getRepository(Trip);

      // Load and verify ownership
      const adj = await adjRepo.findOne({
        where: { id: adjustmentId },
        relations: ['trip'],
      });
      if (!adj) throw new NotFoundException('Adjustment not found');
      if (!adj.trip || adj.trip.requesterId !== dadorUserId) {
        throw new NotFoundException('Adjustment not found');
      }

      // Idempotent conditional update
      const allowedCurrent: AdjustmentStatus[] = [AdjustmentStatus.PROPOSED];
      // INFORMATIVE AUTO_APPLIED within deadline can be reverted
      if (
        adj.status === AdjustmentStatus.AUTO_APPLIED &&
        adj.policyApplied === AdjustmentPolicy.INFORMATIVE &&
        adj.autoApplyDeadline &&
        adj.autoApplyDeadline > new Date()
      ) {
        allowedCurrent.push(AdjustmentStatus.AUTO_APPLIED);
      }

      if (!allowedCurrent.includes(adj.status)) {
        throw new ConflictException(
          `Adjustment already ${adj.status}; cannot transition to ${newStatus}`,
        );
      }

      const wasAutoApplied = adj.status === AdjustmentStatus.AUTO_APPLIED;

      const result = await adjRepo
        .createQueryBuilder()
        .update()
        .set({
          status: newStatus,
          respondedBy: dadorUserId,
          respondedAt: new Date(),
          rejectionReason: reason,
        })
        .where('id = :id', { id: adjustmentId })
        .andWhere('status IN (:...allowed)', { allowed: allowedCurrent })
        .execute();

      if (!result.affected) {
        throw new ConflictException('Adjustment state changed concurrently');
      }

      // Apply to trip total depending on transitions
      const amount = Number(adj.adjustmentAmount);
      if (newStatus === AdjustmentStatus.ACCEPTED && !wasAutoApplied) {
        // PROPOSED → ACCEPTED: add to total
        await this.applyAdjustmentToTrip(tripRepoTx, adj.tripId, amount);
      } else if (newStatus === AdjustmentStatus.REJECTED && wasAutoApplied) {
        // AUTO_APPLIED → REJECTED (revert): subtract
        await this.applyAdjustmentToTrip(tripRepoTx, adj.tripId, -amount);
      }

      const refreshed = await adjRepo.findOneByOrFail({ id: adjustmentId });
      this.logger.log(
        `Adjustment ${adjustmentId} transitioned to ${newStatus} by ${dadorUserId}`,
      );
      return refreshed;
    });
  }

  private async applyAdjustmentToTrip(
    manager: Repository<Trip>,
    tripId: string,
    delta: number,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update()
      .set({
        totalFuelAdjustment: () => `total_fuel_adjustment + ${delta.toFixed(2)}`,
      })
      .where('id = :id', { id: tripId })
      .execute();
  }

  /**
   * Finalize a trip's fuel cost on DELIVERED (or any terminal state).
   * Expires PROPOSED, freezes actual_final_amount = price + total_fuel_adjustment.
   */
  async finalizeTripFuelCost(tripId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const adjRepo = manager.getRepository(TripFuelAdjustment);
      const tripRepoTx = manager.getRepository(Trip);

      await adjRepo
        .createQueryBuilder()
        .update()
        .set({ status: AdjustmentStatus.EXPIRED })
        .where('tripId = :tripId', { tripId })
        .andWhere('status = :status', { status: AdjustmentStatus.PROPOSED })
        .execute();

      await tripRepoTx
        .createQueryBuilder()
        .update()
        .set({
          actualFinalAmount: () => `price + total_fuel_adjustment`,
        })
        .where('id = :id', { id: tripId })
        .execute();
    });
  }

  async listByTripId(tripId: string): Promise<TripFuelAdjustment[]> {
    return this.adjustmentRepo.find({
      where: { tripId },
      order: { createdAt: 'ASC' },
    });
  }

  async findById(id: string): Promise<TripFuelAdjustment | null> {
    return this.adjustmentRepo.findOne({ where: { id } });
  }

  /**
   * Used by cron to auto-apply deadline-expired PROPOSED adjustments
   * (INFORMATIVE policy that was kept as PROPOSED for any reason) OR to
   * finalize AUTO_APPLIED INFORMATIVE past their revert deadline.
   */
  async processExpiredDeadlines(now: Date = new Date()): Promise<number> {
    const expired = await this.adjustmentRepo.find({
      where: {
        status: In([AdjustmentStatus.PROPOSED]),
      },
    });
    let n = 0;
    for (const adj of expired) {
      if (adj.autoApplyDeadline && adj.autoApplyDeadline <= now) {
        // PROPOSED that expired without response → EXPIRED
        await this.adjustmentRepo
          .createQueryBuilder()
          .update()
          .set({ status: AdjustmentStatus.EXPIRED })
          .where('id = :id', { id: adj.id })
          .andWhere('status = :status', { status: AdjustmentStatus.PROPOSED })
          .execute();
        n++;
      }
    }
    return n;
  }
}
