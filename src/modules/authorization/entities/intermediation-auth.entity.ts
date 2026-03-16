import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('intermediation_authorizations')
export class IntermediationAuth {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'company_name', type: 'varchar', length: 255 })
  companyName: string;

  @Column({ name: 'company_cuit', type: 'varchar', length: 20 })
  companyCuit: string;

  @Column({ name: 'representative_name', type: 'varchar', length: 255, nullable: true })
  representativeName: string | null;

  @Column({ name: 'representative_role', type: 'varchar', length: 100, nullable: true })
  representativeRole: string | null;

  @Column({ name: 'signed_at', type: 'timestamp' })
  signedAt: Date;

  @Column({ name: 'document_url', type: 'varchar', length: 1000, nullable: true })
  documentUrl: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
