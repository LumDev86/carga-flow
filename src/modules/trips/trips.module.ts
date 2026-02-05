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

// Check if Redis is configured
const isRedisConfigured = () => {
  return !!(process.env.REDIS_HOST && process.env.REDIS_PORT);
};

const bullImports = isRedisConfigured()
  ? [BullModule.registerQueue({ name: 'trips' })]
  : [];

const bullProviders = isRedisConfigured() ? [AssignmentProcessor] : [];

// Provide a null queue token when Redis is not configured
const queueProvider = isRedisConfigured()
  ? []
  : [
      {
        provide: 'TRIPS_QUEUE',
        useValue: null,
      },
    ];

@Module({
  imports: [
    TypeOrmModule.forFeature([Trip, User]),
    ...bullImports,
    EventsModule,
    GeolocationModule,
  ],
  controllers: [TripsController],
  providers: [TripsService, ...bullProviders, ...queueProvider],
  exports: [TripsService],
})
export class TripsModule {}
