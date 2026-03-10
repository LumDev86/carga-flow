import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('grain_tariff_rates')
@Index(['km'], { unique: true })
export class GrainTariffRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  km: number;

  @Column({ name: 'price_per_ton', type: 'decimal', precision: 12, scale: 2 })
  pricePerTon: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
