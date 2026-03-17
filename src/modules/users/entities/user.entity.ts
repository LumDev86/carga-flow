import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { UserRole } from '../../../shared/enums/user-role.enum';
import { UserStatus } from '../../../shared/enums/user-status.enum';
import { AccountType } from '../../../shared/enums/account-type.enum';
import { RefreshToken } from './refresh-token.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  @Exclude()
  password: string;

  @Column()
  phone: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.SOLICITANTE,
  })
  rol: UserRole;

  @Column({
    type: 'enum',
    enum: AccountType,
    default: AccountType.INDIVIDUO,
    name: 'account_type',
  })
  accountType: AccountType;

  @Column({
    nullable: true,
    type: 'varchar',
    length: 255,
    name: 'company_name',
  })
  companyName: string | null;

  @Column({
    nullable: true,
    type: 'varchar',
    length: 50,
    name: 'company_tax_id',
  })
  companyTaxId: string | null;

  @Column({
    nullable: true,
    type: 'varchar',
    length: 500,
    name: 'company_address',
  })
  companyAddress: string | null;

  // Campos específicos para transportistas
  @Column({
    nullable: true,
    type: 'varchar',
    length: 20,
  })
  dni: string | null;

  @Column({
    nullable: true,
    type: 'varchar',
    length: 20,
  })
  cuit: string | null;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.PENDING,
  })
  estado: UserStatus;

  @Column({ 
    type: 'decimal', 
    precision: 10, 
    scale: 2, 
    default: 0,
    name: 'wallet_balance' 
  })
  walletBalance: number;

  @Column({ 
    default: false,
    name: 'email_verified' 
  })
  emailVerified: boolean;

  @Column({ 
    default: false,
    name: 'phone_verified' 
  })
  phoneVerified: boolean;

  @Column({ 
    nullable: true,
    name: 'email_otp' 
  })
  @Exclude()
  emailOtp: string;

  @Column({ 
    nullable: true,
    type: 'timestamp',
    name: 'email_otp_expires' 
  })
  @Exclude()
  emailOtpExpires: Date;

  @Column({ 
    nullable: true,
    name: 'phone_otp' 
  })
  @Exclude()
  phoneOtp: string;

  @Column({
    nullable: true,
    type: 'timestamp',
    name: 'phone_otp_expires'
  })
  @Exclude()
  phoneOtpExpires: Date;

  @Column({
    nullable: true,
    type: 'decimal',
    precision: 10,
    scale: 7
  })
  latitude: number | null;

  @Column({
    nullable: true,
    type: 'decimal',
    precision: 10,
    scale: 7
  })
  longitude: number | null;

  @Column({
    nullable: true,
    type: 'varchar',
    length: 500
  })
  address: string | null;

  @Column({
    nullable: true,
    type: 'varchar',
    length: 1000,
    name: 'avatar_url',
  })
  avatarUrl: string | null;

  @Column({
    default: false,
    name: 'is_available',
  })
  isAvailable: boolean;

  // --- Datos bancarios (para retiros) ---
  @Column({ nullable: true, type: 'varchar', length: 22 })
  cbu: string | null;

  @Column({ nullable: true, type: 'varchar', length: 50, name: 'bank_alias' })
  bankAlias: string | null;

  @Column({ nullable: true, type: 'varchar', length: 100, name: 'bank_name' })
  bankName: string | null;

  @Column({ nullable: true, type: 'varchar', length: 200, name: 'bank_holder_name' })
  bankHolderName: string | null;

  @Column({ nullable: true, type: 'varchar', length: 200, name: 'push_token' })
  pushToken: string | null;

  // --- Declaración jurada (6 puntos, aceptada en registro) ---
  @Column({ default: false, name: 'has_accepted_declaration' })
  hasAcceptedDeclaration: boolean;

  @Column({ nullable: true, type: 'timestamp', name: 'declaration_accepted_at' })
  declarationAcceptedAt: Date | null;

  // --- Autorización de intermediación de flete ---
  @Column({ default: false, name: 'has_signed_intermediation_auth' })
  hasSignedIntermediationAuth: boolean;

  @Column({ nullable: true, type: 'timestamp', name: 'intermediation_signed_at' })
  intermediationSignedAt: Date | null;

  @Column({ nullable: true, type: 'varchar', length: 255, name: 'intermediation_company_name' })
  intermediationCompanyName: string | null;

  @Column({ nullable: true, type: 'varchar', length: 20, name: 'intermediation_company_cuit' })
  intermediationCompanyCuit: string | null;

  @Column({ nullable: true, type: 'varchar', length: 255, name: 'intermediation_representative_name' })
  intermediationRepresentativeName: string | null;

  @Column({ nullable: true, type: 'varchar', length: 100, name: 'intermediation_representative_role' })
  intermediationRepresentativeRole: string | null;

  @OneToMany(() => RefreshToken, (refreshToken) => refreshToken.user)
  refreshTokens: RefreshToken[];

  @OneToMany(() => Vehicle, (vehicle) => vehicle.user)
  vehicles: Vehicle[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
