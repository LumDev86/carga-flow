import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PricingCategory {
  COMBUSTIBLE = 'COMBUSTIBLE',
  ZONA = 'ZONA',
  URGENCIA = 'URGENCIA',
  RETORNO = 'RETORNO',
  COMERCIAL = 'COMERCIAL',
}

@Entity('pricing_parameters')
@Index(['key'], { unique: true })
export class PricingParameter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  value: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: PricingCategory,
    default: PricingCategory.COMERCIAL,
  })
  category: PricingCategory;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'valid_from', type: 'timestamp', nullable: true })
  validFrom: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
