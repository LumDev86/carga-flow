import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';
import { CpeStatus } from '../../../shared/enums/cpe-status.enum';
import { CpeType } from '../../../shared/enums/cpe-type.enum';
import { CpeAuditLog } from './cpe-audit-log.entity';

@Entity('cpe_records')
export class CpeRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trip_id', type: 'uuid' })
  @Index({ unique: true })
  tripId: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({ name: 'cpe_number', type: 'varchar', length: 50, nullable: true })
  cpeNumber: string | null;

  @Column({
    name: 'cpe_type',
    type: 'int',
    default: CpeType.AUTOMOTOR,
  })
  cpeType: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: CpeStatus.DRAFT,
  })
  status: CpeStatus;

  @Column({ name: 'cuit_solicitante', type: 'varchar', length: 20, nullable: true })
  cuitSolicitante: string | null;

  @Column({ type: 'int', nullable: true })
  sucursal: number | null;

  @Column({ name: 'nro_orden', type: 'bigint', nullable: true })
  nroOrden: number | null;

  @Column({ name: 'request_payload', type: 'jsonb', nullable: true })
  requestPayload: Record<string, any> | null;

  @Column({ name: 'response_payload', type: 'jsonb', nullable: true })
  responsePayload: Record<string, any> | null;

  @Column({ name: 'afip_error_code', type: 'varchar', length: 20, nullable: true })
  afipErrorCode: string | null;

  @Column({ name: 'afip_error_message', type: 'text', nullable: true })
  afipErrorMessage: string | null;

  @Column({ name: 'pdf_url', type: 'varchar', length: 500, nullable: true })
  pdfUrl: string | null;

  @Column({ name: 'authorized_at', type: 'timestamp', nullable: true })
  authorizedAt: Date | null;

  @Column({ name: 'voided_at', type: 'timestamp', nullable: true })
  voidedAt: Date | null;

  @OneToMany(() => CpeAuditLog, (log) => log.cpeRecord)
  auditLogs: CpeAuditLog[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
