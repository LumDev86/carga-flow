import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Trip } from './trip.entity';
import { User } from '../../users/entities/user.entity';

export enum QualityParameter {
  HUMEDAD = 'HUMEDAD',
  OLOR = 'OLOR',
  CUERPOS_EXTRANOS = 'CUERPOS_EXTRANOS',
  MMA = 'MMA',
  TEMPERATURA = 'TEMPERATURA',
  GRANO_DANADO = 'GRANO_DANADO',
  GRANO_QUEBRADO = 'GRANO_QUEBRADO',
  OTRO = 'OTRO',
}

@Entity('quality_observations')
@Index(['tripId'])
export class QualityObservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trip_id', type: 'uuid' })
  tripId: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({
    type: 'enum',
    enum: QualityParameter,
  })
  parameter: QualityParameter;

  @Column({ name: 'observed_value', type: 'varchar', length: 100 })
  observedValue: string;

  @Column({ name: 'discount_kg', type: 'decimal', precision: 10, scale: 2, nullable: true })
  discountKg: number | null;

  @Column({ name: 'requires_reconditioning', type: 'boolean', default: false })
  requiresReconditioning: boolean;

  @Column({ name: 'to_chamber', type: 'boolean', default: false })
  toChamber: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'reported_by_id', type: 'uuid' })
  reportedById: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'reported_by_id' })
  reportedBy: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
