import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Trip } from '../trips/entities/trip.entity';
import { User } from '../users/entities/user.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { TariffRate } from '../tariffs/entities/tariff-rate.entity';
import { WalletTransaction } from '../wallet/entities/wallet-transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Trip, User, Vehicle, TariffRate, WalletTransaction])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
