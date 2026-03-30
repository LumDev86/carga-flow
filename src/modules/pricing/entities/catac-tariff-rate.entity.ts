import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('catac_tariff_rates')
@Index(['km', 'version'], { unique: true })
export class CatacTariffRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  km: number;

  @Column({ name: 'tariff_total', type: 'decimal', precision: 12, scale: 2 })
  tariffTotal: number;

  @Column({ name: 'avg_per_km', type: 'decimal', precision: 10, scale: 2 })
  avgPerKm: number;

  @Column({ type: 'varchar', length: 50, default: 'CATAC-VIGENTE' })
  version: string;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
