import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum DriverScoreStatus {
  ACTIVE = 'ACTIVE',
  WARNING = 'WARNING',
  BLOCKED = 'BLOCKED',
  SUSPENDED = 'SUSPENDED',
}

@Entity('driver_scores')
@Index(['driverId'], { unique: true })
export class DriverScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'driver_id', type: 'uuid' })
  driverId: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'driver_id' })
  driver: User;

  @Column({ name: 'total_trips', type: 'int', default: 0 })
  totalTrips: number;

  @Column({ name: 'completed_trips', type: 'int', default: 0 })
  completedTrips: number;

  @Column({ name: 'cancelled_trips', type: 'int', default: 0 })
  cancelledTrips: number;

  @Column({ name: 'on_time_count', type: 'int', default: 0 })
  onTimeCount: number;

  @Column({ name: 'on_time_rate', type: 'decimal', precision: 5, scale: 4, default: 1.0 })
  onTimeRate: number;

  @Column({ name: 'acceptance_count', type: 'int', default: 0 })
  acceptanceCount: number;

  @Column({ name: 'rejection_count', type: 'int', default: 0 })
  rejectionCount: number;

  @Column({ name: 'acceptance_rate', type: 'decimal', precision: 5, scale: 4, default: 1.0 })
  acceptanceRate: number;

  @Column({ name: 'avg_rating', type: 'decimal', precision: 3, scale: 2, default: 5.0 })
  avgRating: number;

  @Column({ name: 'total_ratings', type: 'int', default: 0 })
  totalRatings: number;

  @Column({ name: 'incident_count', type: 'int', default: 0 })
  incidentCount: number;

  @Column({ name: 'weighted_score', type: 'decimal', precision: 5, scale: 2, default: 5.0 })
  weightedScore: number;

  @Column({
    type: 'enum',
    enum: DriverScoreStatus,
    default: DriverScoreStatus.ACTIVE,
  })
  status: DriverScoreStatus;

  @Column({ name: 'block_count', type: 'int', default: 0 })
  blockCount: number;

  @Column({ name: 'blocked_until', type: 'timestamp', nullable: true })
  blockedUntil: Date | null;

  @Column({ name: 'last_calculated_at', type: 'timestamp', nullable: true })
  lastCalculatedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
