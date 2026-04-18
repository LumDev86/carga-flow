import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { PricingParameter } from '../../pricing/entities/pricing-parameter.entity';
import { User } from '../../users/entities/user.entity';
import { FuelPriceHistory } from '../entities/fuel-price-history.entity';
import { FuelPriceCommandService } from './fuel-price-command.service';
import { FeatureFlagService } from './feature-flag.service';
import { FuelType } from '../../../shared/enums/fuel-type.enum';
import { FuelSource } from '../../../shared/enums/fuel-source.enum';

/**
 * Datos oficiales de Secretaría de Energía (CKAN).
 * Dataset "Precios en Surtidor - Resolución 314/2016".
 */
const DATASET_CSV_URL =
  'http://datos.energia.gob.ar/dataset/1c181390-5045-475e-94dc-410429be4b17/resource/80ac25de-a44a-4445-9215-090cf55cfda5/download/precios-en-surtidor-resolucin-3142016.csv';

/** Mapping según catálogo de la Res. 314/2016 */
const PRODUCT_MAP: Record<FuelType, number> = {
  [FuelType.COMUN]: 19, // "Gas Oil Grado 2"
  [FuelType.PREMIUM]: 21, // "Gas Oil Grado 3"
};

interface FetchConfig {
  /** Marca comercial de referencia. Default YPF. */
  brand: string;
  /** Provincia de referencia. Default BUENOS AIRES. */
  province: string;
  /** Ventana máxima en días para considerar precio "reciente". */
  freshnessDays: number;
  /** Threshold mínimo de cambio para registrar (evita ruido). */
  minPctChange: number;
}

const DEFAULTS: FetchConfig = {
  brand: 'YPF',
  province: 'BUENOS AIRES',
  freshnessDays: 30,
  minPctChange: 0.005, // 0.5%
};

export interface FetchResult {
  fuelType: FuelType;
  status:
    | 'registered'
    | 'skipped_no_change'
    | 'skipped_below_threshold'
    | 'skipped_idempotent'
    | 'no_data'
    | 'error';
  samples?: number;
  medianPrice?: number;
  previousPrice?: number | null;
  pctChange?: number;
  error?: string;
}

/**
 * Descarga el dataset oficial y registra precios automáticamente.
 * Robusto contra:
 *   - API caída / timeout → no hace nada, loguea
 *   - Formato inesperado → skip silencioso
 *   - Precios anómalos → usa mediana para robustez
 *   - Re-runs en el mismo día → idempotencia por hash de fecha+tipo
 *
 * See ADR-008.
 */
@Injectable()
export class FuelPriceAutoFetchService {
  private readonly logger = new Logger(FuelPriceAutoFetchService.name);
  private static readonly ADMIN_BOT_EMAIL = 'admin@cargaflow.com';
  private static readonly FETCH_TIMEOUT_MS = 30_000;

  constructor(
    @InjectRepository(PricingParameter)
    private readonly paramRepo: Repository<PricingParameter>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(FuelPriceHistory)
    private readonly historyRepo: Repository<FuelPriceHistory>,
    private readonly cmd: FuelPriceCommandService,
    private readonly flags: FeatureFlagService,
  ) {}

  async fetchAndRegister(): Promise<FetchResult[]> {
    const enabled = await this.flags.isEnabled('FUEL_AUTO_FETCH_ENABLED');
    if (!enabled) {
      this.logger.log('FUEL_AUTO_FETCH_ENABLED=false, skipping auto-fetch');
      return [];
    }

    const config = await this.loadConfig();
    this.logger.log(
      `Auto-fetch started: brand=${config.brand} province=${config.province}`,
    );

    const admin = await this.userRepo.findOne({
      where: { email: FuelPriceAutoFetchService.ADMIN_BOT_EMAIL },
    });
    if (!admin) {
      this.logger.error(
        `Admin user ${FuelPriceAutoFetchService.ADMIN_BOT_EMAIL} not found — cannot register prices`,
      );
      return [];
    }

    let csv: string;
    try {
      csv = await this.downloadCsv();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Dataset download failed: ${msg}`);
      return [
        { fuelType: FuelType.COMUN, status: 'error', error: msg },
        { fuelType: FuelType.PREMIUM, status: 'error', error: msg },
      ];
    }

    const rows = this.parseCsv(csv);
    this.logger.log(`Parsed ${rows.length} rows from dataset`);

    const results: FetchResult[] = [];
    for (const fuelType of [FuelType.COMUN, FuelType.PREMIUM]) {
      try {
        const res = await this.processFuelType(fuelType, rows, config, admin.id);
        results.push(res);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Process ${fuelType} failed: ${msg}`);
        results.push({ fuelType, status: 'error', error: msg });
      }
    }

    return results;
  }

  private async loadConfig(): Promise<FetchConfig> {
    // Numeric thresholds live in pricing_parameters (numeric(12,4))
    const numKeys = [
      'fuel_autofetch_freshness_days',
      'fuel_autofetch_min_pct_change',
    ];
    const numRows = await this.paramRepo
      .createQueryBuilder('p')
      .where('p.key IN (:...keys)', { keys: numKeys })
      .getMany();
    const numMap = new Map(numRows.map((r) => [r.key, Number(r.value)]));

    // String configs (brand, province) live in feature_flags (jsonb)
    const brand =
      (await this.flags.get<string>('FUEL_AUTOFETCH_BRAND')) || DEFAULTS.brand;
    const province =
      (await this.flags.get<string>('FUEL_AUTOFETCH_PROVINCE')) ||
      DEFAULTS.province;

    return {
      brand,
      province,
      freshnessDays:
        numMap.get('fuel_autofetch_freshness_days') ?? DEFAULTS.freshnessDays,
      minPctChange:
        numMap.get('fuel_autofetch_min_pct_change') ?? DEFAULTS.minPctChange,
    };
  }

  private async downloadCsv(): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      FuelPriceAutoFetchService.FETCH_TIMEOUT_MS,
    );
    try {
      const res = await fetch(DATASET_CSV_URL, {
        signal: controller.signal,
        headers: { 'User-Agent': 'CargaFlow/1.0 fuel-tracking' },
      });
      if (!res.ok) {
        throw new Error(`Dataset HTTP ${res.status}`);
      }
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parser simple adaptado al formato conocido del CSV:
   *   19 columnas, la última (geojson) contiene comas y comillas.
   *   Resto no contiene comas internas.
   * Implementación manual para evitar añadir dep.
   */
  private parseCsv(csv: string): Array<Record<string, string>> {
    // Strip BOM
    if (csv.charCodeAt(0) === 0xfeff) csv = csv.slice(1);
    const lines = csv.split(/\r?\n/);
    if (lines.length < 2) return [];
    const header = lines[0].split(',');
    const rows: Array<Record<string, string>> = [];
    // We only need up to column "longitud" (index 17); skip geojson (18)
    const wanted = header.slice(0, 18);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      // Split first 18 commas manually to avoid splitting inside geojson
      const parts: string[] = [];
      let from = 0;
      for (let n = 0; n < 18 && from < line.length; n++) {
        const next = line.indexOf(',', from);
        if (next === -1) {
          parts.push(line.slice(from));
          from = line.length;
        } else {
          parts.push(line.slice(from, next));
          from = next + 1;
        }
      }
      if (parts.length < wanted.length) continue;
      const obj: Record<string, string> = {};
      for (let j = 0; j < wanted.length; j++) {
        obj[wanted[j]] = parts[j];
      }
      rows.push(obj);
    }
    return rows;
  }

  private async processFuelType(
    fuelType: FuelType,
    allRows: Array<Record<string, string>>,
    config: FetchConfig,
    adminId: string,
  ): Promise<FetchResult> {
    const targetIdProducto = String(PRODUCT_MAP[fuelType]);
    const brandUpper = config.brand.toUpperCase();
    const provinceUpper = config.province.toUpperCase();
    const freshnessCutoff = new Date(
      Date.now() - config.freshnessDays * 24 * 60 * 60 * 1000,
    );

    const samples = allRows
      .filter((r) => r.idproducto === targetIdProducto)
      .filter((r) => (r.empresabandera || '').toUpperCase() === brandUpper)
      .filter((r) => (r.provincia || '').toUpperCase() === provinceUpper)
      .filter((r) => {
        const d = new Date(r.fecha_vigencia);
        return !Number.isNaN(d.getTime()) && d >= freshnessCutoff;
      })
      .map((r) => Number(r.precio))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (samples.length === 0) {
      this.logger.warn(
        `No samples found for ${fuelType} (brand=${config.brand}, province=${config.province})`,
      );
      return { fuelType, status: 'no_data' };
    }

    const median = this.median(samples);

    // Previous price from history
    const priorRow = await this.historyRepo
      .createQueryBuilder('h')
      .where('h.fuelType = :fuelType', { fuelType })
      .orderBy('h.effectiveFrom', 'DESC')
      .limit(1)
      .getOne();
    const previousPrice = priorRow ? Number(priorRow.pricePerLiter) : null;

    const pctChange =
      previousPrice && previousPrice > 0
        ? (median - previousPrice) / previousPrice
        : null;

    if (pctChange !== null && Math.abs(pctChange) < config.minPctChange) {
      this.logger.log(
        `${fuelType}: median ${median} vs prior ${previousPrice} (${(pctChange * 100).toFixed(2)}%) below threshold, skip`,
      );
      return {
        fuelType,
        status: 'skipped_below_threshold',
        samples: samples.length,
        medianPrice: median,
        previousPrice,
        pctChange,
      };
    }

    // Deterministic idempotency key per day+type+source → re-runs same day are no-ops
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const idempotencyKey = createHash('sha256')
      .update(`autofetch-${today}-${fuelType}-secenergia`)
      .digest('hex')
      .slice(0, 32);

    try {
      const { record, wasIdempotentHit } = await this.cmd.registerPriceChange(
        adminId,
        {
          fuelType,
          pricePerLiter: Math.round(median * 100) / 100,
          source: FuelSource.API_ENARGAS,
          sourceRef: `datos.energia.gob.ar / ${config.brand} ${config.province} · mediana de ${samples.length} muestras (${config.freshnessDays}d)`,
          notes: `Auto-fetched ${today}`,
        },
        idempotencyKey,
      );

      if (wasIdempotentHit) {
        this.logger.log(`${fuelType}: already registered today (idempotent)`);
        return {
          fuelType,
          status: 'skipped_idempotent',
          samples: samples.length,
          medianPrice: median,
          previousPrice,
          pctChange: pctChange ?? undefined,
        };
      }

      this.logger.log(
        `${fuelType}: registered $${median.toFixed(2)}/L (${samples.length} samples, ${pctChange !== null ? (pctChange * 100).toFixed(2) + '%' : 'no prior'})`,
      );
      return {
        fuelType,
        status: 'registered',
        samples: samples.length,
        medianPrice: median,
        previousPrice,
        pctChange: pctChange ?? undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Register failed for ${fuelType}: ${msg}`);
      return { fuelType, status: 'error', error: msg };
    }
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
}
