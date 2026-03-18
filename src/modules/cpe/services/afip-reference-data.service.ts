import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

const CACHE_TTL = 86400; // 24 hours in seconds

// Códigos de tipos de grano AFIP (usados en WSCPE)
const GRAIN_TYPES: { code: number; description: string }[] = [
  { code: 1, description: 'Trigo Pan' },
  { code: 2, description: 'Trigo Duro' },
  { code: 3, description: 'Trigo Forrajero' },
  { code: 5, description: 'Maíz' },
  { code: 6, description: 'Sorgo Granífero' },
  { code: 12, description: 'Girasol' },
  { code: 23, description: 'Soja' },
  { code: 24, description: 'Lino' },
  { code: 31, description: 'Cebada Cervecera' },
  { code: 34, description: 'Avena' },
  { code: 36, description: 'Centeno' },
  { code: 39, description: 'Arroz' },
  { code: 40, description: 'Maní' },
  { code: 43, description: 'Algodón' },
  { code: 51, description: 'Colza/Canola' },
];

// Códigos de provincias AFIP
const PROVINCES: { code: number; name: string }[] = [
  { code: 0, name: 'Ciudad Autónoma de Buenos Aires' },
  { code: 1, name: 'Buenos Aires' },
  { code: 2, name: 'Catamarca' },
  { code: 3, name: 'Chaco' },
  { code: 4, name: 'Chubut' },
  { code: 5, name: 'Córdoba' },
  { code: 6, name: 'Corrientes' },
  { code: 7, name: 'Entre Ríos' },
  { code: 8, name: 'Formosa' },
  { code: 9, name: 'Jujuy' },
  { code: 10, name: 'La Pampa' },
  { code: 11, name: 'La Rioja' },
  { code: 12, name: 'Mendoza' },
  { code: 13, name: 'Misiones' },
  { code: 14, name: 'Neuquén' },
  { code: 15, name: 'Río Negro' },
  { code: 16, name: 'Salta' },
  { code: 17, name: 'San Juan' },
  { code: 18, name: 'San Luis' },
  { code: 19, name: 'Santa Cruz' },
  { code: 20, name: 'Santa Fe' },
  { code: 21, name: 'Santiago del Estero' },
  { code: 22, name: 'Tierra del Fuego' },
  { code: 23, name: 'Tucumán' },
];

@Injectable()
export class AfipReferenceDataService {
  private readonly logger = new Logger(AfipReferenceDataService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getGrainTypes(): Promise<{ code: number; description: string }[]> {
    const cacheKey = 'afip:grain_types';
    const cached = await this.cacheManager.get<typeof GRAIN_TYPES>(cacheKey);
    if (cached) return cached;

    await this.cacheManager.set(cacheKey, GRAIN_TYPES, CACHE_TTL);
    return GRAIN_TYPES;
  }

  async getProvinces(): Promise<{ code: number; name: string }[]> {
    const cacheKey = 'afip:provinces';
    const cached = await this.cacheManager.get<typeof PROVINCES>(cacheKey);
    if (cached) return cached;

    await this.cacheManager.set(cacheKey, PROVINCES, CACHE_TTL);
    return PROVINCES;
  }

  getGrainTypeByCode(code: number): string | null {
    const grain = GRAIN_TYPES.find((g) => g.code === code);
    return grain?.description ?? null;
  }

  getProvinceByCode(code: number): string | null {
    const province = PROVINCES.find((p) => p.code === code);
    return province?.name ?? null;
  }
}
