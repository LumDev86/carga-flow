import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { PricingParameter } from '../../pricing/entities/pricing-parameter.entity';

export type ConsumptionSource = 'vehicle' | 'equipment_default' | 'global_default';

export interface ResolvedConsumption {
  litersPer100Km: number;
  source: ConsumptionSource;
  sourceDetail?: string;
}

/**
 * Resolves the fuel consumption (L/100km) of a vehicle following
 * the fallback chain defined in ADR-007.
 *
 *   1. vehicle.fuel_consumption (explicit)
 *   2. pricing_parameters['fuel_consumption_default_<equipment_type>']
 *   3. pricing_parameters['fuel_consumption_default_GLOBAL']
 *   4. hardcoded constant 30.0 + warn log (shouldn't happen if seeds ran)
 */
@Injectable()
export class VehicleConsumptionService {
  private readonly logger = new Logger(VehicleConsumptionService.name);
  private static readonly HARDCODED_FALLBACK = 30.0;

  constructor(
    @InjectRepository(PricingParameter)
    private readonly paramRepo: Repository<PricingParameter>,
  ) {}

  async resolve(vehicle: Vehicle): Promise<ResolvedConsumption> {
    if (vehicle.fuelConsumption != null) {
      const value = Number(vehicle.fuelConsumption);
      if (Number.isFinite(value) && value > 0) {
        return {
          litersPer100Km: value,
          source: 'vehicle',
          sourceDetail: `vehicle.id=${vehicle.id}`,
        };
      }
    }

    if (vehicle.equipmentType) {
      const key = `fuel_consumption_default_${vehicle.equipmentType}`;
      const fromEquipment = await this.getParam(key);
      if (fromEquipment != null) {
        return {
          litersPer100Km: fromEquipment,
          source: 'equipment_default',
          sourceDetail: key,
        };
      }
    }

    const globalDefault = await this.getParam('fuel_consumption_default_GLOBAL');
    if (globalDefault != null) {
      return {
        litersPer100Km: globalDefault,
        source: 'global_default',
        sourceDetail: 'fuel_consumption_default_GLOBAL',
      };
    }

    this.logger.warn(
      `No consumption defaults found; using hardcoded ${VehicleConsumptionService.HARDCODED_FALLBACK} L/100km for vehicle ${vehicle.id}`,
    );
    return {
      litersPer100Km: VehicleConsumptionService.HARDCODED_FALLBACK,
      source: 'global_default',
      sourceDetail: 'hardcoded',
    };
  }

  private async getParam(key: string): Promise<number | null> {
    const row = await this.paramRepo.findOne({ where: { key } });
    if (!row) return null;
    const parsed = Number(row.value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
