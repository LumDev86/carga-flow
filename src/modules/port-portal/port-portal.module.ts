import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from '../trips/entities/trip.entity';
import { TripDocument } from '../trips/entities/trip-document.entity';
import { TripIncident } from '../trips/entities/trip-incident.entity';
import { User } from '../users/entities/user.entity';
import { Port } from '../ports/entities/port.entity';
import { CpeRecord } from '../cpe/entities/cpe-record.entity';
import { PortPortalController } from './port-portal.controller';
import { PortPortalService } from './port-portal.service';
import { EventsModule } from '../events/events.module';
import { PortsModule } from '../ports/ports.module';
import { TripsModule } from '../trips/trips.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trip, User, Port, TripDocument, TripIncident, CpeRecord]),
    EventsModule,
    PortsModule,
    TripsModule,
    NotificationsModule,
    StorageModule,
  ],
  controllers: [PortPortalController],
  providers: [PortPortalService],
})
export class PortPortalModule {}
