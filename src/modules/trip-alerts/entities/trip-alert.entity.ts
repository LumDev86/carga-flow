import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';
import { User } from '../../users/entities/user.entity';
import { Port } from '../../ports/entities/port.entity';
import {
  TripAlertType,
  TripAlertPriority,
  TripAlertStatus,
} from '../../../shared/enums/trip-alert.enum';

@Entity('trip_alerts')
export class TripAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trip_id', type: 'uuid' })
  @Index()
  tripId: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({ name: 'port_id', type: 'uuid' })
  @Index()
  portId: string;

  @ManyToOne(() => Port)
  @JoinColumn({ name: 'port_id' })
  port: Port;

  @Column({ name: 'sent_by_user_id', type: 'uuid' })
  sentByUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sent_by_user_id' })
  sentBy: User;

  @Column({ name: 'receiver_id', type: 'uuid' })
  @Index()
  receiverId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'receiver_id' })
  receiver: User;

  @Column({
    type: 'enum',
    enum: TripAlertType,
  })
  type: TripAlertType;

  @Column({
    type: 'enum',
    enum: TripAlertPriority,
    default: TripAlertPriority.NORMAL,
  })
  priority: TripAlertPriority;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({
    type: 'enum',
    enum: TripAlertStatus,
    default: TripAlertStatus.SENT,
  })
  status: TripAlertStatus;

  @Column({ name: 'sent_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  sentAt: Date;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt: Date | null;

  @Column({ name: 'acknowledged_at', type: 'timestamp', nullable: true })
  acknowledgedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
