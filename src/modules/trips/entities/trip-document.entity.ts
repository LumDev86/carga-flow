import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Trip } from './trip.entity';
import { DocumentType } from '../../../shared/enums/document-type.enum';

@Entity('trip_documents')
export class TripDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'trip_id' })
  tripId: string;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({
    type: 'enum',
    enum: DocumentType,
    default: DocumentType.OTRO,
  })
  type: DocumentType;

  @Column({ type: 'varchar', length: 1000 })
  url: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  filename: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
