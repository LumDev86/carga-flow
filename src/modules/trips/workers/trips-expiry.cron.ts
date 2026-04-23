import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TripsService } from '../trips.service';

/**
 * Cron que marca como EXPIRED los viajes en PENDING/BROADCAST que:
 *   - ya tienen su scheduled_pickup_at vencido, o
 *   - llevan más de 48 h sin que ningún chofer los acepte.
 *
 * Por cada trip expirado se emite WS trip:expired al dador y push
 * notification (best-effort). Ver TripsService.expireStaleTrips.
 *
 * Schedule: cada 15 minutos. Idempotente — si un trip ya está EXPIRED,
 * no se vuelve a tocar.
 *
 * Los errores se loguean y no rompen nada más.
 */
@Injectable()
export class TripsExpiryCron {
  private readonly logger = new Logger(TripsExpiryCron.name);

  constructor(private readonly tripsService: TripsService) {}

  @Cron('*/15 * * * *', {
    name: 'trips-expiry',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  async run(): Promise<void> {
    try {
      const result = await this.tripsService.expireStaleTrips();
      if (result.expired > 0 || result.errors > 0) {
        this.logger.log(
          `expireStaleTrips done: expired=${result.expired}, errors=${result.errors}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`TripsExpiryCron failed: ${msg}`);
    }
  }
}
