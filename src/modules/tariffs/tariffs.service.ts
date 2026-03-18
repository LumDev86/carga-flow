import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { v4 as uuidv4 } from 'uuid';
import { TariffRate } from './entities/tariff-rate.entity';
import { GrainTariffRate } from './entities/grain-tariff-rate.entity';
import { TransportType } from '../../shared/enums/transport-type.enum';
import { GrainTariffEntryDto } from './dto/grain-tariff.dto';
import { FetraPdfParserService } from './fetra-pdf-parser.service';

const TARIFF_CACHE_KEY = 'tariffs:active';
const GRAIN_TARIFF_CACHE_KEY = 'tariffs:grain';
const TARIFF_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class TariffService {
  private readonly logger = new Logger(TariffService.name);

  constructor(
    @InjectRepository(TariffRate)
    private readonly tariffRepository: Repository<TariffRate>,
    @InjectRepository(GrainTariffRate)
    private readonly grainTariffRepository: Repository<GrainTariffRate>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly fetraPdfParser: FetraPdfParserService,
    private readonly dataSource: DataSource,
  ) {}

  // ==========================================
  // Tarifas generales por tipo de transporte
  // ==========================================

  async getActiveTariffs(): Promise<TariffRate[]> {
    const cached = await this.cacheManager.get<TariffRate[]>(TARIFF_CACHE_KEY);
    if (cached) return cached;

    const tariffs = await this.tariffRepository.find({
      where: { isActive: true },
      order: { pricePerKm: 'ASC' },
    });

    await this.cacheManager.set(TARIFF_CACHE_KEY, tariffs, TARIFF_CACHE_TTL);
    return tariffs;
  }

  async getTariffForTransport(
    transportType: TransportType,
  ): Promise<TariffRate | null> {
    const tariffs = await this.getActiveTariffs();
    return tariffs.find((t) => t.transportType === transportType) || null;
  }

  async updateTariff(
    id: string,
    data: { pricePerKm?: number; commissionRate?: number },
  ): Promise<TariffRate> {
    await this.tariffRepository.update(id, data);
    await this.cacheManager.del(TARIFF_CACHE_KEY);
    return this.tariffRepository.findOneOrFail({ where: { id } });
  }

  // ==========================================
  // Tarifas cerealeras (Fe.Tr.A) - $/TN por km
  // ==========================================

  async getGrainTariffs(): Promise<GrainTariffRate[]> {
    const cached = await this.cacheManager.get<GrainTariffRate[]>(GRAIN_TARIFF_CACHE_KEY);
    if (cached) return cached;

    const tariffs = await this.grainTariffRepository.find({
      order: { km: 'ASC' },
    });

    await this.cacheManager.set(GRAIN_TARIFF_CACHE_KEY, tariffs, TARIFF_CACHE_TTL);
    return tariffs;
  }

  /**
   * Busca el $/TN para una distancia dada.
   * Si la distancia exacta no existe, interpola entre el km inferior y superior.
   */
  async getGrainPricePerTon(distanceKm: number): Promise<number | null> {
    const roundedKm = Math.round(distanceKm);
    if (roundedKm <= 0) return null;

    const tariffs = await this.getGrainTariffs();
    if (tariffs.length === 0) return null;

    // Búsqueda exacta
    const exact = tariffs.find((t) => t.km === roundedKm);
    if (exact) return Number(exact.pricePerTon);

    // Si es menor al mínimo, usar el mínimo
    if (roundedKm < tariffs[0].km) return Number(tariffs[0].pricePerTon);

    // Si es mayor al máximo, usar el máximo
    const last = tariffs[tariffs.length - 1];
    if (roundedKm > last.km) return Number(last.pricePerTon);

    // Interpolar entre los dos más cercanos
    let lower: GrainTariffRate | null = null;
    let upper: GrainTariffRate | null = null;

    for (let i = 0; i < tariffs.length - 1; i++) {
      if (tariffs[i].km <= roundedKm && tariffs[i + 1].km >= roundedKm) {
        lower = tariffs[i];
        upper = tariffs[i + 1];
        break;
      }
    }

    if (lower && upper) {
      const ratio = (roundedKm - lower.km) / (upper.km - lower.km);
      return Number(lower.pricePerTon) + ratio * (Number(upper.pricePerTon) - Number(lower.pricePerTon));
    }

    return null;
  }

  /**
   * Calcula el precio total para un viaje de granos.
   * @returns { pricePerTon, totalPrice, weightTon, distanceKm }
   */
  async calculateGrainPrice(
    distanceKm: number,
    weightTon: number,
    commissionRate?: number,
  ): Promise<{
    pricePerTon: number;
    totalPrice: number;
    commission: number;
    driverPayout: number;
    weightTon: number;
    distanceKm: number;
  } | null> {
    const pricePerTon = await this.getGrainPricePerTon(distanceKm);
    if (pricePerTon === null) return null;

    const totalPrice = Math.round(pricePerTon * weightTon);
    const rate = commissionRate ?? 0.15;
    const commission = Math.round(totalPrice * rate);
    const driverPayout = totalPrice - commission;

    return {
      pricePerTon: Math.round(pricePerTon * 100) / 100,
      totalPrice,
      commission,
      driverPayout,
      weightTon,
      distanceKm: Math.round(distanceKm * 100) / 100,
    };
  }

  /**
   * Carga masiva de tarifas cerealeras (reemplaza todas las existentes).
   */
  async bulkUpsertGrainTariffs(entries: GrainTariffEntryDto[]): Promise<{ count: number }> {
    this.logger.log(`Cargando ${entries.length} tarifas cerealeras...`);

    // Usar upsert para insertar o actualizar por km
    await this.grainTariffRepository
      .createQueryBuilder()
      .insert()
      .into(GrainTariffRate)
      .values(
        entries.map((e) => ({
          km: e.km,
          pricePerTon: e.pricePerTon,
        })),
      )
      .orUpdate(['price_per_ton', 'updated_at'], ['km'])
      .execute();

    // Invalidar cache
    await this.cacheManager.del(GRAIN_TARIFF_CACHE_KEY);

    this.logger.log(`${entries.length} tarifas cerealeras cargadas exitosamente`);
    return { count: entries.length };
  }

  /**
   * Reemplaza toda la tabla de tarifas cerealeras.
   * Usa transacción para que si falla el insert no se pierda la tabla.
   */
  async replaceAllGrainTariffs(entries: GrainTariffEntryDto[]): Promise<{ count: number }> {
    this.logger.log(`Reemplazando todas las tarifas cerealeras con ${entries.length} entradas...`);

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(GrainTariffRate);
      await repo.clear();

      const entities = entries.map((e) =>
        repo.create({ km: e.km, pricePerTon: e.pricePerTon }),
      );

      await repo.save(entities, { chunk: 200 });
    });

    await this.cacheManager.del(GRAIN_TARIFF_CACHE_KEY);

    this.logger.log(`${entries.length} tarifas cerealeras reemplazadas exitosamente`);
    return { count: entries.length };
  }

  async getGrainTariffCount(): Promise<number> {
    return this.grainTariffRepository.count();
  }

  // ==========================================
  // Import PDF Fe.Tr.A
  // ==========================================

  async parseAndStageGrainPdf(
    file: Express.Multer.File,
  ): Promise<{ importId: string; entries: { km: number; pricePerTon: number }[]; metadata: any }> {
    const result = await this.fetraPdfParser.parsePdf(file.buffer);

    const importId = uuidv4();
    const cacheKey = `tariff-import:${importId}`;

    await this.cacheManager.set(
      cacheKey,
      {
        entries: result.entries,
        metadata: result.metadata,
        originalFilename: file.originalname,
        uploadedAt: new Date().toISOString(),
      },
      1800, // 30 minutes TTL
    );

    this.logger.log(`PDF Fe.Tr.A parseado y staged: importId=${importId}, ${result.entries.length} entradas`);

    return {
      importId,
      entries: result.entries,
      metadata: result.metadata,
    };
  }

  async confirmGrainPdfImport(importId: string): Promise<{ count: number }> {
    const cacheKey = `tariff-import:${importId}`;
    const staged = await this.cacheManager.get<{
      entries: { km: number; pricePerTon: number }[];
      metadata: any;
    }>(cacheKey);

    if (!staged) {
      throw new BadRequestException(
        'Importación no encontrada o expirada. Suba el PDF nuevamente.',
      );
    }

    const result = await this.replaceAllGrainTariffs(staged.entries);

    // Remove staged data
    await this.cacheManager.del(cacheKey);

    this.logger.log(`Importación PDF Fe.Tr.A confirmada: ${result.count} tarifas reemplazadas`);

    return result;
  }
}
