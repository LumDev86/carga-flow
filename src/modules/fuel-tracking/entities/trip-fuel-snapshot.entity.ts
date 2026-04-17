import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';
import { FuelPriceHistory } from './fuel-price-history.entity';
import { FuelType } from '../../../shared/enums/fuel-type.enum';

/**
 * Immutable snapshot created when a trip is accepted by a driver.
 * Captures the fuel pricing context at that moment so future adjustments
 * have a stable baseline. See ADR-001.
 */
@Entity('trip_fuel_snapshots')
export class TripFuelSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trip_id', type: 'uuid', unique: true })
  tripId: string;

  @OneToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({
    name: 'fuel_type',
    type: 'enum',
    enum: FuelType,
    enumName: 'fuel_type_enum',
  })
  fuelType: FuelType;

  @Column({
    name: 'initial_price_per_liter',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  initialPricePerLiter: string;

  @Column({ name: 'initial_price_history_id', type: 'uuid' })
  initialPriceHistoryId: string;

  @ManyToOne(() => FuelPriceHistory)
  @JoinColumn({ name: 'initial_price_history_id' })
  initialPriceHistory: FuelPriceHistory;

  /** Consumo resuelto (L/100km) — puede venir del vehicle o del fallback */
  @Column({
    name: 'vehicle_fuel_consumption',
    type: 'decimal',
    precision: 6,
    scale: 2,
  })
  vehicleFuelConsumption: string;

  @Column({
    name: 'estimated_total_km',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  estimatedTotalKm: string;

  @Column({
    name: 'estimated_total_liters',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  estimatedTotalLiters: string;

  /**
   * Full snapshot of config at creation time for auditability.
   * Includes: consumption_source, thresholds, grace_window, feature_flag snapshot
   */
  @Column({ name: 'config_snapshot', type: 'jsonb' })
  configSnapshot: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
