import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CpeRecord } from './cpe-record.entity';
import { User } from '../../users/entities/user.entity';

@Entity('cpe_audit_logs')
export class CpeAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cpe_record_id', type: 'uuid' })
  cpeRecordId: string;

  @ManyToOne(() => CpeRecord, (cpe) => cpe.auditLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cpe_record_id' })
  cpeRecord: CpeRecord;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ name: 'performed_by_id', type: 'uuid', nullable: true })
  performedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'performed_by_id' })
  performedBy: User | null;

  @Column({ name: 'request_data', type: 'jsonb', nullable: true })
  requestData: Record<string, any> | null;

  @Column({ name: 'response_data', type: 'jsonb', nullable: true })
  responseData: Record<string, any> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
