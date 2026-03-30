import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { CatacTariffRate } from './entities/catac-tariff-rate.entity';
import { PricingParameter, PricingCategory } from './entities/pricing-parameter.entity';
import { TripQuote } from './entities/trip-quote.entity';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { CatacTariffEntryDto } from './dto/import-catac.dto';

const CATAC_CACHE_KEY = 'pricing:catac';
const PARAMS_CACHE_KEY = 'pricing:params';
const CACHE_TTL = 300; // 5 minutes

// Parámetros iniciales (seeds)
const DEFAULT_PARAMETERS: Array<{
  key: string;
  value: number;
  description: string;
  category: PricingCategory;
}> = [
  {
    key: 'gasoil_base_comun',
    value: 1867,
    description: 'Precio gasoil común de referencia (ancla para fórmula)',
    category: PricingCategory.COMBUSTIBLE,
  },
  {
    key: 'gasoil_base_premium',
    value: 2041,
    description: 'Precio gasoil premium de referencia',
    category: PricingCategory.COMBUSTIBLE,
  },
  {
    key: 'gasoil_actual',
    value: 1867,
    description: 'Precio gasoil actual (actualizable diaria o semanalmente)',
    category: PricingCategory.COMBUSTIBLE,
  },
  {
    key: 'zone_normal',
    value: 1.0,
    description: 'Coeficiente zona núcleo / corredor normal',
    category: PricingCategory.ZONA,
  },
  {
    key: 'zone_low_supply',
    value: 1.12,
    description: 'Coeficiente zona con baja oferta de camiones',
    category: PricingCategory.ZONA,
  },
  {
    key: 'zone_high_supply',
    value: 0.97,
    description: 'Coeficiente zona con alta oferta de camiones',
    category: PricingCategory.ZONA,
  },
  {
    key: 'zone_difficult',
    value: 1.15,
    description: 'Coeficiente destino/origen difícil o sin retorno',
    category: PricingCategory.ZONA,
  },
  {
    key: 'urgency_base',
    value: 1.0,
    description: 'Coeficiente sin urgencia (carga normal)',
    category: PricingCategory.URGENCIA,
  },
  {
    key: 'urgency_high',
    value: 1.08,
    description: 'Coeficiente carga urgente (< 3 horas)',
    category: PricingCategory.URGENCIA,
  },
  {
    key: 'return_port_normal',
    value: 0.88,
    description: 'Coeficiente retorno vacío puerto → interior (caso normal)',
    category: PricingCategory.RETORNO,
  },
  {
    key: 'return_port_urgent',
    value: 0.96,
    description: 'Coeficiente retorno puerto con pocos camiones',
    category: PricingCategory.RETORNO,
  },
  {
    key: 'return_double_match',
    value: 0.82,
    description: 'Coeficiente doble match ida/vuelta dentro de app',
    category: PricingCategory.RETORNO,
  },
  {
    key: 'commercial_margin_min',
    value: 0.96,
    description: 'Multiplicador para calcular precio mínimo (4% menos)',
    category: PricingCategory.COMERCIAL,
  },
  {
    key: 'commercial_margin_max',
    value: 1.04,
    description: 'Multiplicador para calcular precio máximo (4% más)',
    category: PricingCategory.COMERCIAL,
  },
  {
    key: 'commission_rate',
    value: 0.15,
    description: 'Tasa de comisión CargaFlow (15%)',
    category: PricingCategory.COMERCIAL,
  },
];

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    @InjectRepository(CatacTariffRate)
    private readonly catacRepository: Repository<CatacTariffRate>,
    @InjectRepository(PricingParameter)
    private readonly paramRepository: Repository<PricingParameter>,
    @InjectRepository(TripQuote)
    private readonly quoteRepository: Repository<TripQuote>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly dataSource: DataSource,
  ) {}

  // ==========================================
  // INICIALIZACIÓN - Seed de parámetros
  // ==========================================

  async seedDefaultParameters(): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    for (const param of DEFAULT_PARAMETERS) {
      const existing = await this.paramRepository.findOne({
        where: { key: param.key },
      });

      if (!existing) {
        await this.paramRepository.save(
          this.paramRepository.create({
            key: param.key,
            value: param.value,
            description: param.description,
            category: param.category,
          }),
        );
        created++;
      } else {
        skipped++;
      }
    }

    this.logger.log(`Seed parámetros: ${created} creados, ${skipped} ya existían`);
    return { created, skipped };
  }

  // ==========================================
  // TABLA CATAC
  // ==========================================

  async getCatacTariffs(): Promise<CatacTariffRate[]> {
    const cached = await this.cacheManager.get<CatacTariffRate[]>(CATAC_CACHE_KEY);
    if (cached) return cached;

    const tariffs = await this.catacRepository.find({
      order: { km: 'ASC' },
    });

    await this.cacheManager.set(CATAC_CACHE_KEY, tariffs, CACHE_TTL);
    return tariffs;
  }

  async getCatacTariffCount(): Promise<number> {
    return this.catacRepository.count();
  }

  /**
   * Lookup en tabla CATAC: busca tarifa total para una distancia.
   * Si no hay km exacto, interpola entre inferior y superior.
   */
  async lookupCatacBase(distanceKm: number): Promise<number | null> {
    const roundedKm = Math.round(distanceKm);
    if (roundedKm <= 0) return null;

    const tariffs = await this.getCatacTariffs();
    if (tariffs.length === 0) return null;

    // Exacto
    const exact = tariffs.find((t) => t.km === roundedKm);
    if (exact) return Number(exact.tariffTotal);

    // Menor al mínimo
    if (roundedKm < tariffs[0].km) return Number(tariffs[0].tariffTotal);

    // Mayor al máximo
    const last = tariffs[tariffs.length - 1];
    if (roundedKm > last.km) {
      // Extrapolar linealmente desde los últimos 2 puntos
      if (tariffs.length >= 2) {
        const prev = tariffs[tariffs.length - 2];
        const ratePerKm =
          (Number(last.tariffTotal) - Number(prev.tariffTotal)) /
          (last.km - prev.km);
        return Number(last.tariffTotal) + ratePerKm * (roundedKm - last.km);
      }
      return Number(last.tariffTotal);
    }

    // Interpolar
    let lower: CatacTariffRate | null = null;
    let upper: CatacTariffRate | null = null;

    for (let i = 0; i < tariffs.length - 1; i++) {
      if (tariffs[i].km <= roundedKm && tariffs[i + 1].km >= roundedKm) {
        lower = tariffs[i];
        upper = tariffs[i + 1];
        break;
      }
    }

    if (lower && upper) {
      const ratio = (roundedKm - lower.km) / (upper.km - lower.km);
      return (
        Number(lower.tariffTotal) +
        ratio * (Number(upper.tariffTotal) - Number(lower.tariffTotal))
      );
    }

    return null;
  }

  /**
   * Importar tabla CATAC completa (reemplaza la existente).
   */
  async importCatacTariffs(
    entries: CatacTariffEntryDto[],
    version?: string,
    validFrom?: string,
  ): Promise<{ count: number }> {
    this.logger.log(`Importando ${entries.length} tarifas CATAC...`);

    const ver = version || 'CATAC-VIGENTE';
    const vf = validFrom ? new Date(validFrom) : null;

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CatacTariffRate);
      await repo.clear();

      const entities = entries.map((e) =>
        repo.create({
          km: e.km,
          tariffTotal: e.tariffTotal,
          avgPerKm: Math.round((e.tariffTotal / e.km) * 100) / 100,
          version: ver,
          validFrom: vf,
        }),
      );

      await repo.save(entities, { chunk: 200 });
    });

    await this.cacheManager.del(CATAC_CACHE_KEY);

    this.logger.log(`${entries.length} tarifas CATAC importadas (version: ${ver})`);
    return { count: entries.length };
  }

  /**
   * Upsert parcial de tarifas CATAC (agrega o actualiza por km).
   */
  async upsertCatacTariffs(
    entries: CatacTariffEntryDto[],
    version?: string,
    validFrom?: string,
  ): Promise<{ count: number }> {
    const ver = version || 'CATAC-VIGENTE';
    const vf = validFrom ? new Date(validFrom) : null;

    await this.catacRepository
      .createQueryBuilder()
      .insert()
      .into(CatacTariffRate)
      .values(
        entries.map((e) => ({
          km: e.km,
          tariffTotal: e.tariffTotal,
          avgPerKm: Math.round((e.tariffTotal / e.km) * 100) / 100,
          version: ver,
          validFrom: vf,
        })),
      )
      .orUpdate(['tariff_total', 'avg_per_km', 'version', 'valid_from', 'updated_at'], ['km', 'version'])
      .execute();

    await this.cacheManager.del(CATAC_CACHE_KEY);
    return { count: entries.length };
  }

  // ==========================================
  // PARÁMETROS DINÁMICOS
  // ==========================================

  async getAllParameters(): Promise<PricingParameter[]> {
    const cached = await this.cacheManager.get<PricingParameter[]>(PARAMS_CACHE_KEY);
    if (cached) return cached;

    const params = await this.paramRepository.find({
      order: { category: 'ASC', key: 'ASC' },
    });

    await this.cacheManager.set(PARAMS_CACHE_KEY, params, CACHE_TTL);
    return params;
  }

  async getParametersByCategory(category: PricingCategory): Promise<PricingParameter[]> {
    const all = await this.getAllParameters();
    return all.filter((p) => p.category === category);
  }

  async getParameterValue(key: string): Promise<number> {
    const all = await this.getAllParameters();
    const param = all.find((p) => p.key === key);
    if (!param) {
      throw new NotFoundException(`Parámetro '${key}' no encontrado`);
    }
    return Number(param.value);
  }

  async updateParameter(
    key: string,
    value: number,
    updatedBy?: string,
    description?: string,
    validFrom?: string,
  ): Promise<PricingParameter> {
    const param = await this.paramRepository.findOne({ where: { key } });
    if (!param) {
      throw new NotFoundException(`Parámetro '${key}' no encontrado`);
    }

    param.value = value;
    if (updatedBy) param.updatedBy = updatedBy;
    if (description !== undefined) param.description = description;
    if (validFrom) param.validFrom = new Date(validFrom);

    const saved = await this.paramRepository.save(param);
    await this.cacheManager.del(PARAMS_CACHE_KEY);

    this.logger.log(`Parámetro '${key}' actualizado a ${value} por ${updatedBy || 'system'}`);
    return saved;
  }

  async createParameter(data: {
    key: string;
    value: number;
    description?: string;
    category: PricingCategory;
    validFrom?: string;
  }): Promise<PricingParameter> {
    const existing = await this.paramRepository.findOne({ where: { key: data.key } });
    if (existing) {
      throw new BadRequestException(`Parámetro '${data.key}' ya existe. Use PATCH para actualizarlo.`);
    }

    const param = this.paramRepository.create({
      key: data.key,
      value: data.value,
      description: data.description || null,
      category: data.category,
      validFrom: data.validFrom ? new Date(data.validFrom) : null,
    });

    const saved = await this.paramRepository.save(param);
    await this.cacheManager.del(PARAMS_CACHE_KEY);
    return saved;
  }

  // ==========================================
  // MOTOR DE COTIZACIÓN
  // ==========================================

  /**
   * Calcula distancia por Haversine (respaldo si no se envía distanceKm).
   */
  private haversineKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    // Clamp to prevent NaN from floating point exceeding 1.0
    const c = 2 * Math.atan2(Math.sqrt(Math.min(a, 1)), Math.sqrt(Math.max(1 - a, 0)));
    // Factor 1.3 para aproximar distancia por ruta vs línea recta
    return Math.round(R * c * 1.3 * 100) / 100;
  }

  /**
   * Calcula coeficiente de combustible.
   */
  private async calculateFuelCoefficient(): Promise<number> {
    try {
      const gasoilBase = await this.getParameterValue('gasoil_base_comun');
      const gasoilActual = await this.getParameterValue('gasoil_actual');
      if (!gasoilBase || gasoilBase <= 0) return 1.0;
      return Math.round((gasoilActual / gasoilBase) * 10000) / 10000;
    } catch {
      return 1.0;
    }
  }

  /**
   * Calcula coeficiente de zona.
   * Por ahora usa el parámetro 'zone_normal' como default.
   * Se puede extender con lógica geográfica por provincia/zona.
   */
  private async calculateZoneCoefficient(
    _originState?: string,
    _destinationState?: string,
  ): Promise<{ coefficient: number; reason: string }> {
    // TODO: En futuro, cruzar con tabla de zonas por provincia/localidad
    // Por ahora, usa zona normal
    try {
      const value = await this.getParameterValue('zone_normal');
      return { coefficient: value, reason: 'zona estándar' };
    } catch {
      return { coefficient: 1.0, reason: 'zona estándar (default)' };
    }
  }

  /**
   * Calcula coeficiente de urgencia basado en la hora de carga.
   */
  private async calculateUrgencyCoefficient(
    loadDatetime?: Date | null,
  ): Promise<{ coefficient: number; reason: string }> {
    if (!loadDatetime) {
      return { coefficient: 1.0, reason: 'sin urgencia' };
    }

    const hoursUntilLoad =
      (loadDatetime.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilLoad <= 3 && hoursUntilLoad > 0) {
      try {
        const value = await this.getParameterValue('urgency_high');
        return { coefficient: value, reason: `carga urgente (${Math.round(hoursUntilLoad * 10) / 10}hs)` };
      } catch {
        return { coefficient: 1.08, reason: 'carga urgente (default)' };
      }
    }

    return { coefficient: 1.0, reason: 'sin urgencia' };
  }

  /**
   * Calcula coeficiente de retorno desde puerto.
   */
  private async calculateReturnCoefficient(
    isPortReturn: boolean,
  ): Promise<{ coefficient: number; reason: string }> {
    if (!isPortReturn) {
      return { coefficient: 1.0, reason: 'viaje estándar (sin retorno puerto)' };
    }

    try {
      const value = await this.getParameterValue('return_port_normal');
      return { coefficient: value, reason: 'retorno desde puerto detectado' };
    } catch {
      return { coefficient: 0.88, reason: 'retorno desde puerto (default)' };
    }
  }

  /**
   * Motor principal de cotización.
   */
  async calculateQuote(
    dto: CreateQuoteDto,
    requestedById?: string,
  ): Promise<TripQuote> {
    // 1. Calcular distancia
    const distanceKm =
      dto.distanceKm ||
      this.haversineKm(
        dto.origin.lat,
        dto.origin.lng,
        dto.destination.lat,
        dto.destination.lng,
      );

    if (distanceKm <= 0) {
      throw new BadRequestException('La distancia debe ser mayor a 0 km');
    }

    // 2. Lookup en tabla CATAC
    const catacBase = await this.lookupCatacBase(distanceKm);
    if (catacBase === null) {
      throw new BadRequestException(
        'No hay tabla CATAC cargada. Importe la tabla desde el panel de admin.',
      );
    }

    // 3. Calcular coeficientes
    const fuelCoef = await this.calculateFuelCoefficient();

    const zone = await this.calculateZoneCoefficient(
      dto.origin.state,
      dto.destination.state,
    );

    const loadDate = dto.loadDatetime ? new Date(dto.loadDatetime) : null;
    const urgency = await this.calculateUrgencyCoefficient(loadDate);

    const returnCoef = await this.calculateReturnCoefficient(
      dto.isPortReturn || false,
    );

    // 4. Calcular precio final
    const tolls = dto.tollsEstimated || 0;
    const baseWithCoefficients =
      catacBase * fuelCoef * zone.coefficient * urgency.coefficient * returnCoef.coefficient;
    const recommendedPrice = Math.round(baseWithCoefficients + tolls);

    // 5. Rango de precios
    let marginMin: number;
    let marginMax: number;
    try {
      marginMin = await this.getParameterValue('commercial_margin_min');
      marginMax = await this.getParameterValue('commercial_margin_max');
    } catch {
      marginMin = 0.96;
      marginMax = 1.04;
    }

    const minPrice = Math.round(recommendedPrice * marginMin);
    const maxPrice = Math.round(recommendedPrice * marginMax);

    // 6. Armar explicación
    const explanation: string[] = [];
    explanation.push(`Distancia: ${distanceKm} km`);
    explanation.push(`Base CATAC: $${Math.round(catacBase).toLocaleString('es-AR')}`);

    if (fuelCoef !== 1.0) {
      explanation.push(`Ajuste combustible: x${fuelCoef}`);
    }
    if (zone.coefficient !== 1.0) {
      explanation.push(`Zona: ${zone.reason} (x${zone.coefficient})`);
    }
    if (urgency.coefficient !== 1.0) {
      explanation.push(`Urgencia: ${urgency.reason} (x${urgency.coefficient})`);
    }
    if (returnCoef.coefficient !== 1.0) {
      explanation.push(`Retorno: ${returnCoef.reason} (x${returnCoef.coefficient})`);
    }
    if (tolls > 0) {
      explanation.push(`Peajes incluidos: $${tolls.toLocaleString('es-AR')}`);
    }

    // 7. Guardar quote
    const quote = this.quoteRepository.create({
      requestedById: requestedById || null,
      originLat: dto.origin.lat,
      originLng: dto.origin.lng,
      originCity: dto.origin.city || null,
      originState: dto.origin.state || null,
      destinationLat: dto.destination.lat,
      destinationLng: dto.destination.lng,
      destinationCity: dto.destination.city || null,
      destinationState: dto.destination.state || null,
      distanceKm,
      cargoType: dto.cargoType || null,
      transportType: dto.transportType || null,
      weightKg: dto.weightKg || null,
      grainType: dto.grainType || null,
      loadDatetime: loadDate,
      catacBase: Math.round(catacBase * 100) / 100,
      fuelCoefficient: fuelCoef,
      zoneCoefficient: zone.coefficient,
      urgencyCoefficient: urgency.coefficient,
      returnCoefficient: returnCoef.coefficient,
      commercialAdjustment: 1.0,
      tollsEstimated: tolls,
      recommendedPrice,
      minPrice,
      maxPrice,
      isPortReturn: dto.isPortReturn || false,
      explanation,
    });

    return this.quoteRepository.save(quote);
  }

  /**
   * Obtener una cotización por ID.
   */
  async getQuoteById(id: string): Promise<TripQuote> {
    const quote = await this.quoteRepository.findOne({ where: { id } });
    if (!quote) {
      throw new NotFoundException(`Cotización '${id}' no encontrada`);
    }
    return quote;
  }

  /**
   * Vincular una cotización a un trip.
   */
  async linkQuoteToTrip(quoteId: string, tripId: string): Promise<void> {
    await this.quoteRepository.update(quoteId, { tripId });
  }
}
