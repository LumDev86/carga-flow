import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CargoType } from '../../../shared/enums/cargo-type.enum';
import { TransportType } from '../../../shared/enums/transport-type.enum';

@Entity('trip_quotes')
export class TripQuote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Quien solicitó la cotización
  @Column({ name: 'requested_by_id', type: 'uuid', nullable: true })
  requestedById: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'requested_by_id' })
  requestedBy: User | null;

  // Origen
  @Column({ name: 'origin_lat', type: 'decimal', precision: 10, scale: 7 })
  originLat: number;

  @Column({ name: 'origin_lng', type: 'decimal', precision: 10, scale: 7 })
  originLng: number;

  @Column({ name: 'origin_city', type: 'varchar', nullable: true })
  originCity: string | null;

  @Column({ name: 'origin_state', type: 'varchar', nullable: true })
  originState: string | null;

  // Destino
  @Column({ name: 'destination_lat', type: 'decimal', precision: 10, scale: 7 })
  destinationLat: number;

  @Column({ name: 'destination_lng', type: 'decimal', precision: 10, scale: 7 })
  destinationLng: number;

  @Column({ name: 'destination_city', type: 'varchar', nullable: true })
  destinationCity: string | null;

  @Column({ name: 'destination_state', type: 'varchar', nullable: true })
  destinationState: string | null;

  // Datos del viaje
  @Column({ name: 'distance_km', type: 'decimal', precision: 10, scale: 2 })
  distanceKm: number;

  @Column({ name: 'cargo_type', type: 'enum', enum: CargoType, nullable: true })
  cargoType: CargoType | null;

  @Column({ name: 'transport_type', type: 'enum', enum: TransportType, nullable: true })
  transportType: TransportType | null;

  @Column({ name: 'weight_kg', type: 'decimal', precision: 10, scale: 2, nullable: true })
  weightKg: number | null;

  @Column({ name: 'grain_type', type: 'varchar', length: 50, nullable: true })
  grainType: string | null;

  @Column({ name: 'load_datetime', type: 'timestamp', nullable: true })
  loadDatetime: Date | null;

  // Resultado del cálculo
  @Column({ name: 'catac_base', type: 'decimal', precision: 12, scale: 2 })
  catacBase: number;

  @Column({ name: 'fuel_coefficient', type: 'decimal', precision: 8, scale: 4, default: 1 })
  fuelCoefficient: number;

  @Column({ name: 'zone_coefficient', type: 'decimal', precision: 8, scale: 4, default: 1 })
  zoneCoefficient: number;

  @Column({ name: 'urgency_coefficient', type: 'decimal', precision: 8, scale: 4, default: 1 })
  urgencyCoefficient: number;

  @Column({ name: 'return_coefficient', type: 'decimal', precision: 8, scale: 4, default: 1 })
  returnCoefficient: number;

  @Column({ name: 'commercial_adjustment', type: 'decimal', precision: 8, scale: 4, default: 1 })
  commercialAdjustment: number;

  @Column({ name: 'tolls_estimated', type: 'decimal', precision: 10, scale: 2, default: 0 })
  tollsEstimated: number;

  @Column({ name: 'recommended_price', type: 'decimal', precision: 12, scale: 2 })
  recommendedPrice: number;

  @Column({ name: 'min_price', type: 'decimal', precision: 12, scale: 2 })
  minPrice: number;

  @Column({ name: 'max_price', type: 'decimal', precision: 12, scale: 2 })
  maxPrice: number;

  @Column({ name: 'is_port_return', type: 'boolean', default: false })
  isPortReturn: boolean;

  @Column({ type: 'jsonb', default: [] })
  explanation: string[];

  // Vinculación con trip (se llena cuando se crea el viaje desde esta quote)
  @Column({ name: 'trip_id', type: 'uuid', nullable: true })
  tripId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
