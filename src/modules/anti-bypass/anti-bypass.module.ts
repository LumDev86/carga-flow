import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BypassEvent } from './entities/bypass-event.entity';
import { Trip } from '../trips/entities/trip.entity';
import { AntiBypassService } from './anti-bypass.service';
import { AntiBypassController } from './anti-bypass.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BypassEvent, Trip])],
  controllers: [AntiBypassController],
  providers: [AntiBypassService],
  exports: [AntiBypassService],
})
export class AntiBypassModule {}
