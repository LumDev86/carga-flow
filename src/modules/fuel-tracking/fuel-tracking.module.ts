import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { FuelPriceHistory } from './entities/fuel-price-history.entity';
import { TripFuelSnapshot } from './entities/trip-fuel-snapshot.entity';
import { TripFuelAdjustment } from './entities/trip-fuel-adjustment.entity';
import { TripLocationHistory } from './entities/trip-location-history.entity';
import { IntegrationOutbox } from './entities/integration-outbox.entity';
import { FeatureFlag } from './entities/feature-flag.entity';
import { FuelAdjustmentNotification } from './entities/fuel-adjustment-notification.entity';

// Cross-module entities needed for services
import { Trip } from '../trips/entities/trip.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { PricingParameter } from '../pricing/entities/pricing-parameter.entity';

// Services (command side - FASE 1.2)
import { VehicleConsumptionService } from './services/vehicle-consumption.service';
import { KmCalculatorService } from './services/km-calculator.service';
import { FuelPriceCommandService } from './services/fuel-price-command.service';
import { FuelSnapshotService } from './services/fuel-snapshot.service';
import { FuelAdjustmentService } from './services/fuel-adjustment.service';

// Policies
import { AdjustmentPolicyResolver } from './policies/adjustment-policy';

/**
 * Fuel Tracking module — realtime gasoil adjustments.
 *
 * FASE 1.1: entities + migrations (done)
 * FASE 1.2: command side services (this commit)
 * FASE 1.3+: query side, worker, endpoints, integration
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
      Trip,
      Vehicle,
      PricingParameter,
    ]),
  ],
  providers: [
    VehicleConsumptionService,
    KmCalculatorService,
    AdjustmentPolicyResolver,
    FuelPriceCommandService,
    FuelSnapshotService,
    FuelAdjustmentService,
  ],
  controllers: [],
  exports: [
    TypeOrmModule,
    VehicleConsumptionService,
    KmCalculatorService,
    AdjustmentPolicyResolver,
    FuelPriceCommandService,
    FuelSnapshotService,
    FuelAdjustmentService,
  ],
})
export class FuelTrackingModule {}
