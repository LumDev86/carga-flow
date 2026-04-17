import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';
import { User } from '../../users/entities/user.entity';
import { TripFuelSnapshot } from './trip-fuel-snapshot.entity';
import { FuelPriceHistory } from './fuel-price-history.entity';
import { AdjustmentStatus } from '../../../shared/enums/adjustment-status.enum';
import { AdjustmentPolicy } from '../../../shared/enums/adjustment-policy.enum';

/**
 * Individual adjustment event triggered by a fuel price change on an active trip.
 * See ADR-001 (hybrid model), ADR-004 (threshold policy), ADR-009 (unique constraint
 * as defense-in-depth against double-processing).
 */
@Entity('trip_fuel_adjustments')
@Unique('uq_trip_adjustments_per_price', ['tripId', 'triggeringPriceHistoryId'])
@Index('idx_trip_fuel_adj_trip_status', ['tripId', 'status'])
export class TripFuelAdjustment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trip_id', type: 'uuid' })
  tripId: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({ name: 'snapshot_id', type: 'uuid' })
  snapshotId: string;

  @ManyToOne(() => TripFuelSnapshot)
  @JoinColumn({ name: 'snapshot_id' })
  snapshot: TripFuelSnapshot;

  @Column({ name: 'triggering_price_history_id', type: 'uuid' })
  triggeringPriceHistoryId: string;

  @ManyToOne(() => FuelPriceHistory)
  @JoinColumn({ name: 'triggering_price_history_id' })
  triggeringPriceHistory: FuelPriceHistory;

  @Column({ name: 'old_price', type: 'decimal', precision: 10, scale: 2 })
  oldPrice: string;

  @Column({ name: 'new_price', type: 'decimal', precision: 10, scale: 2 })
  newPrice: string;

  /** Can be negative for price decreases */
  @Column({ name: 'pct_change', type: 'decimal', precision: 6, scale: 4 })
  pctChange: string;

  @Column({
    name: 'km_traveled_at_trigger',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  kmTraveledAtTrigger: string;

  @Column({
    name: 'km_remaining_at_trigger',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  kmRemainingAtTrigger: string;

  @Column({ name: 'liters_remaining', type: 'decimal', precision: 10, scale: 2 })
  litersRemaining: string;

  /** Can be negative for price decreases (dador pays less) */
  @Column({
    name: 'adjustment_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  adjustmentAmount: string;

  @Column({
    type: 'enum',
    enum: AdjustmentStatus,
    enumName: 'adjustment_status_enum',
    default: AdjustmentStatus.PROPOSED,
  })
  status: AdjustmentStatus;

  @Column({
    name: 'policy_applied',
    type: 'enum',
    enum: AdjustmentPolicy,
    enumName: 'adjustment_policy_enum',
  })
  policyApplied: AdjustmentPolicy;

  @Column({ name: 'responded_by', type: 'uuid', nullable: true })
  respondedBy: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'responded_by' })
  responder: User | null;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'auto_apply_deadline', type: 'timestamptz', nullable: true })
  autoApplyDeadline: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
