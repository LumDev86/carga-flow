import {
  Entity,
  Column,
  PrimaryColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * DB-backed feature flags, edited without deploy.
 * See ADR-010. Cached in memory with 30s TTL + Redis pub/sub invalidation.
 */
@Entity('feature_flags')
export class FeatureFlag {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  /** JSONB to support boolean / number / object config */
  @Column({ type: 'jsonb' })
  value: unknown;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'updated_by' })
  updater: User | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
