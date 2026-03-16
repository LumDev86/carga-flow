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
import { TripStatus } from '../../../shared/enums/trip-status.enum';
import { TransportType } from '../../../shared/enums/transport-type.enum';
import { CargoType } from '../../../shared/enums/cargo-type.enum';
import { PaymentMethodEnum } from '../../../shared/enums/payment-method.enum';

@Entity('trips')
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // --- Relaciones ---
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  @Column({ name: 'requester_id' })
  requesterId: string;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'driver_id' })
  driver: User | null;

  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId: string | null;

  // --- Estado ---
  @Column({
    type: 'enum',
    enum: TripStatus,
    default: TripStatus.PENDING,
  })
  status: TripStatus;

  // --- Origen ---
  @Column({ name: 'origin_address' })
  originAddress: string;

  @Column({ name: 'origin_lat', type: 'decimal', precision: 10, scale: 7 })
  originLat: number;

  @Column({ name: 'origin_lng', type: 'decimal', precision: 10, scale: 7 })
  originLng: number;

  @Column({ name: 'origin_city', type: 'varchar', nullable: true })
  originCity: string | null;

  @Column({ name: 'origin_state', type: 'varchar', nullable: true })
  originState: string | null;

  // --- Destino ---
  @Column({ name: 'destination_address' })
  destinationAddress: string;

  @Column({ name: 'destination_lat', type: 'decimal', precision: 10, scale: 7 })
  destinationLat: number;

  @Column({ name: 'destination_lng', type: 'decimal', precision: 10, scale: 7 })
  destinationLng: number;

  @Column({ name: 'destination_city', type: 'varchar', nullable: true })
  destinationCity: string | null;

  @Column({ name: 'destination_state', type: 'varchar', nullable: true })
  destinationState: string | null;

  // --- Carga ---
  @Column({ name: 'cargo_description' })
  cargoDescription: string;

  @Column({
    name: 'cargo_type',
    type: 'enum',
    enum: CargoType,
    default: CargoType.CARGA_GENERAL,
  })
  cargoType: CargoType;

  @Column({
    name: 'transport_type',
    type: 'enum',
    enum: TransportType,
    default: TransportType.CAMION,
  })
  transportType: TransportType;

  @Column({ name: 'cargo_weight', type: 'decimal', precision: 10, scale: 2, nullable: true })
  cargoWeight: number | null;

  @Column({ name: 'cargo_weight_unit', type: 'varchar', nullable: true, default: 'kg' })
  cargoWeightUnit: string | null;

  @Column({ name: 'cargo_pallets', nullable: true, type: 'int' })
  cargoPallets: number | null;

  @Column({ name: 'cargo_fragile', default: false })
  cargoFragile: boolean;

  @Column({ name: 'cargo_instructions', nullable: true, type: 'text' })
  cargoInstructions: string | null;

  // --- Pricing ---
  @Column({ name: 'distance_km', type: 'decimal', precision: 10, scale: 2, nullable: true })
  distanceKm: number | null;

  @Column({ name: 'estimated_duration', type: 'varchar', nullable: true })
  estimatedDuration: string | null;

  @Column({ name: 'price', type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ name: 'commission', type: 'decimal', precision: 10, scale: 2, default: 0 })
  commission: number;

  @Column({ name: 'driver_payout', type: 'decimal', precision: 10, scale: 2, default: 0 })
  driverPayout: number;

  // --- Payment ---
  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethodEnum,
    default: PaymentMethodEnum.CASH,
  })
  paymentMethod: PaymentMethodEnum;

  @Column({ name: 'payment_intent_id', type: 'varchar', nullable: true })
  paymentIntentId: string | null;

  @Column({ name: 'payment_status', type: 'varchar', nullable: true, default: 'pending' })
  paymentStatus: string | null;

  // --- Schedule ---
  @Column({ name: 'scheduled_pickup_at', type: 'timestamp', nullable: true })
  scheduledPickupAt: Date | null;

  @Column({ name: 'estimated_delivery_at', type: 'timestamp', nullable: true })
  estimatedDeliveryAt: Date | null;

  // --- Assignment tracking ---
  @Column({ name: 'assigned_driver_id', type: 'uuid', nullable: true })
  assignedDriverId: string | null;

  @Column({ name: 'assignment_expires_at', type: 'timestamp', nullable: true })
  assignmentExpiresAt: Date | null;

  @Column({ name: 'broadcast_at', type: 'timestamp', nullable: true })
  broadcastAt: Date | null;

  @Column({ name: 'search_radius_index', type: 'int', nullable: true, default: 0 })
  searchRadiusIndex: number | null;

  // --- Timestamps reales ---
  @Column({ name: 'accepted_at', type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'picked_up_at', type: 'timestamp', nullable: true })
  pickedUpAt: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  // --- Evidencia ---
  @Column({ name: 'remito_url', type: 'varchar', nullable: true })
  remitoUrl: string | null;

  @Column({ name: 'cargo_photo_url', type: 'varchar', nullable: true })
  cargoPhotoUrl: string | null;

  @Column({ name: 'observations', nullable: true, type: 'text' })
  observations: string | null;

  @Column({ name: 'carta_de_porte_url', type: 'varchar', nullable: true })
  cartaDePorteUrl: string | null;

  // --- Flete payment tracking ---
  @Column({ name: 'flete_received_at', type: 'timestamp', nullable: true })
  fleteReceivedAt: Date | null;

  @Column({ name: 'flete_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  fleteAmount: number | null;

  @Column({ name: 'driver_credited_at', type: 'timestamp', nullable: true })
  driverCreditedAt: Date | null;

  // --- Confirmación de descarga ---
  @Column({ name: 'unload_confirmed_at', type: 'timestamp', nullable: true })
  unloadConfirmedAt: Date | null;

  @Column({ name: 'unload_confirmed_by_id', type: 'uuid', nullable: true })
  unloadConfirmedById: string | null;

  // --- Rating ---
  @Column({ type: 'int', nullable: true })
  rating: number | null;

  @Column({ name: 'rating_comments', nullable: true, type: 'text' })
  ratingComments: string | null;

  // --- Driver Rating (chofer califica al dador) ---
  @Column({ name: 'driver_rating', type: 'int', nullable: true })
  driverRating: number | null;

  @Column({ name: 'driver_rating_comments', nullable: true, type: 'text' })
  driverRatingComments: string | null;

  @Column({ name: 'driver_rated_at', type: 'timestamp', nullable: true })
  driverRatedAt: Date | null;

  // --- Timestamps ---
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
