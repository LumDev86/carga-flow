import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { FuelType } from '../../../shared/enums/fuel-type.enum';
import { FuelSource } from '../../../shared/enums/fuel-source.enum';

/**
 * Append-only history of fuel price changes.
 * See ADR-002 — this table never receives UPDATE or DELETE.
 */
@Entity('fuel_price_history')
@Index('idx_fuel_price_history_type_effective', ['fuelType', 'effectiveFrom'])
export class FuelPriceHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'fuel_type',
    type: 'enum',
    enum: FuelType,
    enumName: 'fuel_type_enum',
  })
  fuelType: FuelType;

  @Column({
    name: 'price_per_liter',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  pricePerLiter: string;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom: Date;

  @Column({
    type: 'enum',
    enum: FuelSource,
    enumName: 'fuel_source_enum',
    default: FuelSource.MANUAL_ADMIN,
  })
  source: FuelSource;

  @Column({ name: 'source_ref', type: 'varchar', length: 255, nullable: true })
  sourceRef: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  idempotencyKey: string | null;
}
