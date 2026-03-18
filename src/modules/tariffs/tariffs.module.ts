import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TariffRate } from './entities/tariff-rate.entity';
import { GrainTariffRate } from './entities/grain-tariff-rate.entity';
import { TariffService } from './tariffs.service';
import { TariffController } from './tariffs.controller';
import { FetraPdfParserService } from './fetra-pdf-parser.service';

@Module({
  imports: [TypeOrmModule.forFeature([TariffRate, GrainTariffRate])],
  controllers: [TariffController],
  providers: [TariffService, FetraPdfParserService],
  exports: [TariffService],
})
export class TariffModule {}
