import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TariffRate } from './entities/tariff-rate.entity';
import { TariffService } from './tariffs.service';
import { TariffController } from './tariffs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TariffRate])],
  controllers: [TariffController],
  providers: [TariffService],
  exports: [TariffService],
})
export class TariffModule {}
