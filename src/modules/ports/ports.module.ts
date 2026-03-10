import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Port } from './entities/port.entity';
import { PortsService } from './ports.service';
import { PortsController } from './ports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Port])],
  controllers: [PortsController],
  providers: [PortsService],
  exports: [PortsService],
})
export class PortsModule {}
