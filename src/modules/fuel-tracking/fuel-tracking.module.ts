import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { EventsModule } from '../events/events.module';

// Entities
import { FuelPriceHistory } from './entities/fuel-price-history.entity';
import { TripFuelSnapshot } from './entities/trip-fuel-snapshot.entity';
import { TripFuelAdjustment } from './entities/trip-fuel-adjustment.entity';
import { TripLocationHistory } from './entities/trip-location-history.entity';
import { IntegrationOutbox } from './entities/integration-outbox.entity';
import { FeatureFlag } from './entities/feature-flag.entity';
import { FuelAdjustmentNotification } from './entities/fuel-adjustment-notification.entity';

// Cross-module entities
import { Trip } from '../trips/entities/trip.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { PricingParameter } from '../pricing/entities/pricing-parameter.entity';

// Services — command
import { VehicleConsumptionService } from './services/vehicle-consumption.service';
import { KmCalculatorService } from './services/km-calculator.service';
import { FuelPriceCommandService } from './services/fuel-price-command.service';
import { FuelSnapshotService } from './services/fuel-snapshot.service';
import { FuelAdjustmentService } from './services/fuel-adjustment.service';

// Services — query
import { FeatureFlagService } from './services/feature-flag.service';
import { FuelPriceQueryService } from './services/fuel-price-query.service';
import { FuelAdjustmentQueryService } from './services/fuel-adjustment-query.service';

// Services — orchestration (used by worker)
import { FuelTrackingRecalcService } from './services/fuel-tracking-recalc.service';
import { RedisLockService } from './services/redis-lock.service';
import { FuelNotificationService } from './services/fuel-notification.service';
import { TripLifecycleHooksService } from './services/trip-lifecycle-hooks.service';

// Workers
import { OutboxPollerService } from './workers/outbox-poller.service';
import { FuelPriceChangeProcessor } from './workers/fuel-price-change.processor';
import { AutoApplyDeadlineCron } from './workers/auto-apply-deadline.cron';

// Policies
import { AdjustmentPolicyResolver } from './policies/adjustment-policy';

// Controllers (FASE 1.5)
import {
  AdminFuelPricesController,
  AdminFuelAdjustmentsController,
  AdminFeatureFlagsController,
} from './controllers/admin-fuel-prices.controller';
import {
  TripFuelTrackingController,
  TripLocationController,
} from './controllers/trip-fuel-tracking.controller';
import { PublicFuelPricesController } from './controllers/public-fuel-prices.controller';
import { VehicleFuelConfigController } from './controllers/vehicle-fuel-config.controller';

// BullMQ queue registration — only when Redis is configured
const isRedisConfigured = () =>
  !!(process.env.REDIS_HOST && process.env.REDIS_PORT);

const queueImports = isRedisConfigured()
  ? [BullModule.registerQueue({ name: 'fuel-tracking' })]
  : [];

const workerProviders = isRedisConfigured()
  ? [OutboxPollerService, FuelPriceChangeProcessor]
  : [];

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FuelPriceHistory,
      TripFuelSnapshot,
      TripFuelAdjustment,
      TripLocationHistory,
      IntegrationOutbox,
      FeatureFlag,
      FuelAdjustmentNotification,
      Trip,
      Vehicle,
      PricingParameter,
    ]),
    ...queueImports,
    EventsModule,
  ],
  providers: [
    // command
    VehicleConsumptionService,
    KmCalculatorService,
    AdjustmentPolicyResolver,
    FuelPriceCommandService,
    FuelSnapshotService,
    FuelAdjustmentService,
    // query
    FeatureFlagService,
    FuelPriceQueryService,
    FuelAdjustmentQueryService,
    // orchestration
    FuelTrackingRecalcService,
    RedisLockService,
    FuelNotificationService,
    TripLifecycleHooksService,
    // cron (always on — no-op if feature flag off)
    AutoApplyDeadlineCron,
    // workers (only with Redis)
    ...workerProviders,
  ],
  controllers: [
    AdminFuelPricesController,
    AdminFuelAdjustmentsController,
    AdminFeatureFlagsController,
    TripFuelTrackingController,
    TripLocationController,
    PublicFuelPricesController,
    VehicleFuelConfigController,
  ],
  exports: [
    TypeOrmModule,
    VehicleConsumptionService,
    KmCalculatorService,
    AdjustmentPolicyResolver,
    FuelPriceCommandService,
    FuelSnapshotService,
    FuelAdjustmentService,
    FeatureFlagService,
    FuelPriceQueryService,
    FuelAdjustmentQueryService,
    FuelTrackingRecalcService,
    TripLifecycleHooksService,
  ],
})
export class FuelTrackingModule {}
