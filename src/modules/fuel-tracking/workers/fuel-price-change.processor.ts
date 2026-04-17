import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { FuelTrackingRecalcService, PriceChangedEventPayload } from '../services/fuel-tracking-recalc.service';
import { IntegrationOutbox } from '../entities/integration-outbox.entity';
import { OutboxPollerService } from './outbox-poller.service';

/**
 * BullMQ processor for the 'fuel-tracking' queue.
 * Consumes events dispatched by OutboxPollerService and invokes the
 * orchestration service. See ADR-003.
 *
 * Events handled:
 *   - fuel.price.changed → recalc active trips
 */
@Processor('fuel-tracking')
export class FuelPriceChangeProcessor {
  private readonly logger = new Logger(FuelPriceChangeProcessor.name);

  constructor(
    private readonly recalcService: FuelTrackingRecalcService,
    private readonly outboxPoller: OutboxPollerService,
  ) {}

  @Process('fuel.price.changed')
  async handlePriceChanged(job: Job<IntegrationOutbox>): Promise<void> {
    const item = job.data;
    const payload = item.payload as unknown as PriceChangedEventPayload;
    this.logger.log(
      `Processing fuel.price.changed outbox=${item.id} priceHistoryId=${payload.priceHistoryId}`,
    );
    try {
      await this.recalcService.recalculateForPriceChange(payload);
      await this.outboxPoller.markProcessed(item.id);
      this.logger.log(`Outbox ${item.id} marked PROCESSED`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Outbox ${item.id} failed: ${msg}`);
      // Let Bull retry; if all attempts exhausted, Bull moves to failed list.
      // We mark FAILED here too so it shows in our DB outbox.
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.outboxPoller.markFailed(item.id, msg);
      }
      throw err; // re-throw for Bull retry
    }
  }
}
