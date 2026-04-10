import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripAlert } from './entities/trip-alert.entity';
import { Trip } from '../trips/entities/trip.entity';
import { Port } from '../ports/entities/port.entity';
import { TripAlertsService } from './trip-alerts.service';
import { TripAlertsController } from './trip-alerts.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TripAlert, Trip, Port]),
    NotificationsModule,
    EventsModule,
  ],
  controllers: [TripAlertsController],
  providers: [TripAlertsService],
  exports: [TripAlertsService],
})
export class TripAlertsModule {}
