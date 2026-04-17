import { VehicleConsumptionService } from './vehicle-consumption.service';
import type { Repository } from 'typeorm';
import type { PricingParameter } from '../../pricing/entities/pricing-parameter.entity';
import type { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { EquipmentType } from '../../../shared/enums/equipment-type.enum';

function makeRepo(params: Record<string, number>) {
  return {
    findOne: jest.fn(async ({ where }: { where: { key: string } }) => {
      const v = params[where.key];
      return v === undefined ? null : { key: where.key, value: String(v) };
    }),
  } as unknown as Repository<PricingParameter>;
}

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'veh-1',
    fuelConsumption: null,
    fuelType: 'COMUN',
    equipmentType: null,
    ...overrides,
  } as Vehicle;
}

describe('VehicleConsumptionService', () => {
  it('prefers vehicle-level consumption when set', async () => {
    const svc = new VehicleConsumptionService(makeRepo({}));
    const vehicle = makeVehicle({ fuelConsumption: '42.5' });
    const r = await svc.resolve(vehicle);
    expect(r.litersPer100Km).toBe(42.5);
    expect(r.source).toBe('vehicle');
  });

  it('falls back to equipment default when vehicle consumption is null', async () => {
    const svc = new VehicleConsumptionService(
      makeRepo({ fuel_consumption_default_TOLVA: 32 }),
    );
    const vehicle = makeVehicle({ equipmentType: EquipmentType.TOLVA });
    const r = await svc.resolve(vehicle);
    expect(r.litersPer100Km).toBe(32);
    expect(r.source).toBe('equipment_default');
    expect(r.sourceDetail).toBe('fuel_consumption_default_TOLVA');
  });

  it('falls back to global default when neither vehicle nor equipment is available', async () => {
    const svc = new VehicleConsumptionService(
      makeRepo({ fuel_consumption_default_GLOBAL: 30 }),
    );
    const vehicle = makeVehicle();
    const r = await svc.resolve(vehicle);
    expect(r.litersPer100Km).toBe(30);
    expect(r.source).toBe('global_default');
  });

  it('falls back to hardcoded constant when no params seeded', async () => {
    const svc = new VehicleConsumptionService(makeRepo({}));
    const vehicle = makeVehicle();
    const r = await svc.resolve(vehicle);
    expect(r.litersPer100Km).toBe(30);
    expect(r.source).toBe('global_default');
  });

  it('ignores invalid vehicle consumption (0 or negative)', async () => {
    const svc = new VehicleConsumptionService(
      makeRepo({ fuel_consumption_default_GLOBAL: 30 }),
    );
    const vehicle = makeVehicle({ fuelConsumption: '0' });
    const r = await svc.resolve(vehicle);
    expect(r.source).toBe('global_default');
  });
});
