import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Trip } from '../trips/entities/trip.entity';
import { User } from '../users/entities/user.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { TariffRate } from '../tariffs/entities/tariff-rate.entity';
import { WalletTransaction } from '../wallet/entities/wallet-transaction.entity';
import { WithdrawalRequest } from '../wallet/entities/withdrawal-request.entity';
import { TripsModule } from '../trips/trips.module';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trip, User, Vehicle, TariffRate, WalletTransaction, WithdrawalRequest]),
    TripsModule,
    WalletModule,
    NotificationsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
