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

export enum BypassEventType {
  PHONE_SHARED = 'PHONE_SHARED',
  LINK_SHARED = 'LINK_SHARED',
  REPEATED_DRIVER_OUTSIDE = 'REPEATED_DRIVER_OUTSIDE',
  DIRECT_CONTACT_ATTEMPT = 'DIRECT_CONTACT_ATTEMPT',
  SUSPICIOUS_CANCELLATION = 'SUSPICIOUS_CANCELLATION',
  OTHER = 'OTHER',
}

export enum BypassEventStatus {
  DETECTED = 'DETECTED',
  REVIEWED = 'REVIEWED',
  CONFIRMED = 'CONFIRMED',
  DISMISSED = 'DISMISSED',
}

@Entity('bypass_events')
@Index(['userId'])
@Index(['relatedUserId'])
export class BypassEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'related_user_id', type: 'uuid', nullable: true })
  relatedUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'related_user_id' })
  relatedUser: User | null;

  @Column({ name: 'trip_id', type: 'uuid', nullable: true })
  tripId: string | null;

  @Column({
    type: 'enum',
    enum: BypassEventType,
  })
  type: BypassEventType;

  @Column({
    type: 'enum',
    enum: BypassEventStatus,
    default: BypassEventStatus.DETECTED,
  })
  status: BypassEventStatus;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true })
  reviewedById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
