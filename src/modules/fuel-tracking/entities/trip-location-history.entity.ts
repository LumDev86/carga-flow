import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';

/**
 * Per-trip GPS tracklog. Used to compute accurate km traveled for fuel
 * adjustment prorating. See ADR-011.
 * Retention: 90 days (LGPD / Ley 25.326 compliance).
 */
@Entity('trip_location_history')
@Index('idx_trip_location_trip_time', ['tripId', 'recordedAt'])
export class TripLocationHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trip_id', type: 'uuid' })
  tripId: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  latitude: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  longitude: string;

  @Column({ name: 'speed_kmh', type: 'decimal', precision: 6, scale: 2, nullable: true })
  speedKmh: string | null;

  @Column({ name: 'accuracy_m', type: 'decimal', precision: 8, scale: 2, nullable: true })
  accuracyM: string | null;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
