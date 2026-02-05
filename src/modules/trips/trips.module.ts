import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Trip } from './entities/trip.entity';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { AssignmentProcessor } from './processors/assignment.processor';
import { EventsModule } from '../events/events.module';
import { GeolocationModule } from '../geolocation/geolocation.module';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trip, User]),
    BullModule.registerQueue({ name: 'trips' }),
    EventsModule,
    GeolocationModule,
  ],
  controllers: [TripsController],
  providers: [TripsService, AssignmentProcessor],
  exports: [TripsService],
})
export class TripsModule {}
