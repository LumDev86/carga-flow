import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FuelPriceHistory } from './entities/fuel-price-history.entity';
import { TripFuelSnapshot } from './entities/trip-fuel-snapshot.entity';
import { TripFuelAdjustment } from './entities/trip-fuel-adjustment.entity';
import { TripLocationHistory } from './entities/trip-location-history.entity';
import { IntegrationOutbox } from './entities/integration-outbox.entity';
import { FeatureFlag } from './entities/feature-flag.entity';
import { FuelAdjustmentNotification } from './entities/fuel-adjustment-notification.entity';

/**
 * Fuel Tracking module — realtime gasoil adjustments.
 *
 * FASE 1.1: entities + migrations only.
 * Services, controllers, workers, gateway are added in subsequent phases.
 *
 * See docs/fuel-tracking/README.md for full context.
 */
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
    ]),
  ],
  providers: [],
  controllers: [],
  exports: [TypeOrmModule],
})
export class FuelTrackingModule {}
