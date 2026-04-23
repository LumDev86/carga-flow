import { FuelType } from '../../../shared/enums/fuel-type.enum';
import {
  computeIdempotencyKey,
  selectSamplesByProvince,
} from './fuel-price-auto-fetch.service';

/**
 * Row-factory para construir fixtures del CSV CKAN manteniendo sólo las
 * columnas que las funciones bajo test leen.
 */
function row(province: string, price: number): Record<string, string> {
  return { provincia: province, precio: String(price) };
}

describe('selectSamplesByProvince', () => {
  it('devuelve los samples de la primera provincia con datos (preferred province)', () => {
    const rows = [row('BUENOS AIRES', 2100), row('BUENOS AIRES', 2150), row('SANTA FE', 1990)];
    const result = selectSamplesByProvince(rows, ['BUENOS AIRES', 'SANTA FE']);
    expect(result.provinceUsed).toBe('BUENOS AIRES');
    expect(result.samples).toEqual([2100, 2150]);
  });

  it('hace fallback a la siguiente provincia cuando la preferida no tiene samples', () => {
    const rows = [row('SANTA FE', 1990), row('CAPITAL FEDERAL', 2050)];
    const result = selectSamplesByProvince(rows, [
      'BUENOS AIRES',
      'CAPITAL FEDERAL',
      'SANTA FE',
    ]);
    expect(result.provinceUsed).toBe('CAPITAL FEDERAL');
    expect(result.samples).toEqual([2050]);
  });

  it('hace fallback en cadena hasta encontrar muestras no vacías', () => {
    const rows = [row('CORDOBA', 2200), row('CORDOBA', 2250)];
    const result = selectSamplesByProvince(rows, [
      'BUENOS AIRES',
      'CAPITAL FEDERAL',
      'SANTA FE',
      'CORDOBA',
    ]);
    expect(result.provinceUsed).toBe('CORDOBA');
    expect(result.samples).toEqual([2200, 2250]);
  });

  it('devuelve samples vacío y provinceUsed=null si ninguna provincia tiene datos', () => {
    const rows = [row('MENDOZA', 2000)];
    const result = selectSamplesByProvince(rows, ['BUENOS AIRES', 'SANTA FE']);
    expect(result.provinceUsed).toBeNull();
    expect(result.samples).toEqual([]);
  });

  it('descarta precios inválidos (NaN, 0, negativos)', () => {
    const rows = [
      row('BUENOS AIRES', 2100),
      { provincia: 'BUENOS AIRES', precio: 'not-a-number' },
      row('BUENOS AIRES', 0),
      row('BUENOS AIRES', -5),
      row('BUENOS AIRES', 2200),
    ];
    const result = selectSamplesByProvince(rows, ['BUENOS AIRES']);
    expect(result.samples).toEqual([2100, 2200]);
  });

  it('matchea el nombre de provincia case-insensitive (uppercase input asumido)', () => {
    const rows = [{ provincia: 'buenos aires', precio: '2100' }];
    const result = selectSamplesByProvince(rows, ['BUENOS AIRES']);
    expect(result.provinceUsed).toBe('BUENOS AIRES');
    expect(result.samples).toEqual([2100]);
  });
});

describe('computeIdempotencyKey', () => {
  it('devuelve un hash de 32 chars hex', () => {
    const key = computeIdempotencyKey('2026-04-23', FuelType.COMUN, 2143.5);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('genera el mismo hash para el mismo (día, tipo, precio)', () => {
    const a = computeIdempotencyKey('2026-04-23', FuelType.COMUN, 2143.5);
    const b = computeIdempotencyKey('2026-04-23', FuelType.COMUN, 2143.5);
    expect(a).toBe(b);
  });

  it('genera hashes distintos cuando cambia el precio (re-runs del cron en el mismo día con precio nuevo deben registrar)', () => {
    const a = computeIdempotencyKey('2026-04-23', FuelType.COMUN, 2143.5);
    const b = computeIdempotencyKey('2026-04-23', FuelType.COMUN, 2150.0);
    expect(a).not.toBe(b);
  });

  it('genera el mismo hash cuando los precios difieren en menos de un centavo', () => {
    // Redondeo a centavos: 2143.500 y 2143.504 deben colapsar al mismo key.
    const a = computeIdempotencyKey('2026-04-23', FuelType.COMUN, 2143.5);
    const b = computeIdempotencyKey('2026-04-23', FuelType.COMUN, 2143.504);
    expect(a).toBe(b);
  });

  it('genera hashes distintos para tipos de combustible distintos', () => {
    const a = computeIdempotencyKey('2026-04-23', FuelType.COMUN, 2143.5);
    const b = computeIdempotencyKey('2026-04-23', FuelType.PREMIUM, 2143.5);
    expect(a).not.toBe(b);
  });

  it('genera hashes distintos para días distintos', () => {
    const a = computeIdempotencyKey('2026-04-23', FuelType.COMUN, 2143.5);
    const b = computeIdempotencyKey('2026-04-24', FuelType.COMUN, 2143.5);
    expect(a).not.toBe(b);
  });
});
