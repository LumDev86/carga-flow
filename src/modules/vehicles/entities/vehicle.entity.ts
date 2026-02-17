import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { TransportType } from '../../../shared/enums/transport-type.enum';
import { EquipmentType } from '../../../shared/enums/equipment-type.enum';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.vehicles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20 })
  plate: string;

  @Column({
    type: 'enum',
    enum: TransportType,
  })
  type: TransportType;

  @Column({ type: 'varchar', length: 50 })
  brand: string;

  @Column({ type: 'varchar', length: 50 })
  model: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'varchar', length: 30, nullable: true })
  color: string | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    name: 'max_weight_kg',
  })
  maxWeightKg: number | null;

  // Documentos
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'insurance_photo_url' })
  insurancePhotoUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'license_front_url' })
  licenseFrontUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'license_back_url' })
  licenseBackUrl: string | null;

  @Column({
    type: 'enum',
    enum: EquipmentType,
    nullable: true,
    name: 'equipment_type',
  })
  equipmentType: EquipmentType | null;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
