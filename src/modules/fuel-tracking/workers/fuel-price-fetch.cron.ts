import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FuelPriceAutoFetchService } from '../services/fuel-price-auto-fetch.service';

/**
 * Daily cron that downloads the official fuel price dataset and
 * registers prices automatically. Idempotent (same day → no-op).
 *
 * Schedule: 06:00 America/Argentina/Buenos_Aires (early morning,
 * dataset is usually refreshed overnight).
 *
 * Gated by FUEL_AUTO_FETCH_ENABLED feature flag.
 * Failures are logged; never breaks anything else.
 */
@Injectable()
export class FuelPriceFetchCron {
  private readonly logger = new Logger(FuelPriceFetchCron.name);

  constructor(private readonly autoFetch: FuelPriceAutoFetchService) {}

  @Cron('0 6 * * *', {
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
