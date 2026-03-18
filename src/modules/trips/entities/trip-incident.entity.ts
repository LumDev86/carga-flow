import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Trip } from './trip.entity';
import { User } from '../../users/entities/user.entity';
import { IncidentType } from '../../../shared/enums/incident-type.enum';
import { IncidentStatus } from '../../../shared/enums/incident-status.enum';

@Entity('trip_incidents')
export class TripIncident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trip_id' })
  tripId: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({ name: 'reported_by_id' })
  reportedById: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'reported_by_id' })
  reportedBy: User;

  @Column({
    type: 'enum',
    enum: IncidentType,
  })
  type: IncidentType;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: IncidentStatus,
    default: IncidentStatus.REPORTED,
  })
  status: IncidentStatus;

  @Column({ type: 'jsonb', default: [] })
  photos: string[];

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
