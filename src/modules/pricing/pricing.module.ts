import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatacTariffRate } from './entities/catac-tariff-rate.entity';
import { PricingParameter } from './entities/pricing-parameter.entity';
import { TripQuote } from './entities/trip-quote.entity';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CatacTariffRate, PricingParameter, TripQuote]),
  ],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
