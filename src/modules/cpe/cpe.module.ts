import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CpeRecord } from './entities/cpe-record.entity';
import { CpeAuditLog } from './entities/cpe-audit-log.entity';
import { AfipDelegation } from './entities/afip-delegation.entity';
import { Trip } from '../trips/entities/trip.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { AfipService } from './services/afip.service';
import { AfipDelegationService } from './services/afip-delegation.service';
import { CpeService } from './services/cpe.service';
import { CpeMappingService } from './services/cpe-mapping.service';
import { CpeController } from './cpe.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CpeRecord, CpeAuditLog, AfipDelegation, Trip, Vehicle]),
  ],
  controllers: [CpeController],
  providers: [AfipService, AfipDelegationService, CpeService, CpeMappingService],
  exports: [CpeService, AfipDelegationService, AfipService],
})
export class CpeModule {}
