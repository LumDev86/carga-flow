import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GeolocationModule } from './modules/geolocation/geolocation.module';
import { RedisModule } from './common/cache/redis.module';
import { StorageModule } from './common/storage/storage.module';
import { EventsModule } from './modules/events/events.module';
import { TripsModule } from './modules/trips/trips.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TariffModule } from './modules/tariffs/tariffs.module';
import { AdminModule } from './modules/admin/admin.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { PortsModule } from './modules/ports/ports.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { CpeModule } from './modules/cpe/cpe.module';
import { PortPortalModule } from './modules/port-portal/port-portal.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { AssignmentModule } from './modules/assignment/assignment.module';
import { AntiBypassModule } from './modules/anti-bypass/anti-bypass.module';
import { TripAlertsModule } from './modules/trip-alerts/trip-alerts.module';
import { FuelTrackingModule } from './modules/fuel-tracking/fuel-tracking.module';

// Check if Redis is configured
const isRedisConfigured = () => {
  return !!(process.env.REDIS_HOST && process.env.REDIS_PORT);
};

// Conditionally include Bull module
const conditionalImports = isRedisConfigured()
  ? [
      BullModule.forRootAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          redis: {
            host: configService.get('REDIS_HOST'),
            port: configService.get<number>('REDIS_PORT'),
            username: configService.get('REDIS_USERNAME'),
            password: configService.get('REDIS_PASSWORD'),
          },
        }),
      }),
    ]
  : [];

@Module({
  imports: [
    // Load environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database (TypeORM + PostgreSQL)
    DatabaseModule,

    // Scheduled tasks (cron + intervals) — used by fuel-tracking workers
    ScheduleModule.forRoot(),

    // Bull Queue (Redis) - only if configured
    ...conditionalImports,

    // Redis cache
    RedisModule,

    // Supabase Storage
    StorageModule,

    // Feature modules
    AuthModule,
    UsersModule,
    GeolocationModule,
    EventsModule,
    TripsModule,
    VehiclesModule,
    NotificationsModule,
    TariffModule,
    AdminModule,
    PaymentsModule,
    WalletModule,
    PortsModule,
    AuthorizationModule,
    CpeModule,
    PortPortalModule,
    PricingModule,
    AssignmentModule,
    AntiBypassModule,
    TripAlertsModule,
    FuelTrackingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
