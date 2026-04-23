import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FuelPriceAutoFetchService } from '../services/fuel-price-auto-fetch.service';

/**
 * Cron que descarga el dataset oficial de precios en surtidor y registra
 * cambios automáticamente. Idempotente por (día + tipo + precio mediano):
 * re-runs con el mismo precio son no-op, precio distinto genera nuevo registro.
 *
 * Schedule: cada 4 horas (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 BsAs).
 * El primer run del día siempre baja el CSV; los siguientes saltean el GET
 * si el HEAD indica que el dataset upstream no cambió (ETag / Last-Modified).
 *
 * Gateado por feature flag FUEL_AUTO_FETCH_ENABLED.
 * Los errores se loguean; nunca rompen nada más.
 */
@Injectable()
export class FuelPriceFetchCron {
  private readonly logger = new Logger(FuelPriceFetchCron.name);

  constructor(private readonly autoFetch: FuelPriceAutoFetchService) {}

  @Cron('0 */4 * * *', {
    name: 'fuel-price-autofetch',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  async run(): Promise<void> {
    try {
      const results = await this.autoFetch.fetchAndRegister();
      for (const r of results) {
        this.logger.log(
          `fetch.${r.fuelType}: ${r.status}` +
            (r.samples ? ` (${r.samples} samples)` : '') +
            (r.medianPrice ? `, price=$${r.medianPrice.toFixed(2)}` : ''),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fuel auto-fetch cron failed: ${msg}`);
    }
  }
}
