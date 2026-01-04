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

  @OneToMany(() => RefreshToken, (refreshToken) => refreshToken.user)
  refreshTokens: RefreshToken[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
