import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import {
  IntegrationOutbox,
  OutboxStatus,
} from '../entities/integration-outbox.entity';

/**
 * Polls integration_outbox for PENDING rows and dispatches them to BullMQ.
 *
 * Uses `SELECT ... FOR UPDATE SKIP LOCKED` to allow multiple poller instances
 * safely in cluster deployments (ADR-003).
 *
 * Polling interval: 2s (configurable via POLLER_INTERVAL_MS env var).
 */
@Injectable()
export class OutboxPollerService implements OnModuleInit {
  private readonly logger = new Logger(OutboxPollerService.name);
  private isRunning = false;
  private enabled = false;

  private static readonly BATCH_SIZE = 10;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(IntegrationOutbox)
    private readonly outboxRepo: Repository<IntegrationOutbox>,
    @Optional() @InjectQueue('fuel-tracking') private readonly queue: Queue | null,
  ) {}

  onModuleInit() {
    this.enabled =
      !!process.env.REDIS_HOST && !!process.env.REDIS_PORT && !!this.queue;
    if (!this.enabled) {
      this.logger.warn(
        'OutboxPoller disabled (Redis not configured or queue not available)',
      );
    } else {
      this.logger.log('OutboxPoller enabled');
    }
  }

  @Interval('outbox-poll', 2000)
  async poll(): Promise<void> {
    if (!this.enabled || !this.queue) return;
    if (this.isRunning) return; // prevent overlap
    this.isRunning = true;
    try {
      await this.processBatch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Poll failed: ${msg}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async processBatch(): Promise<void> {
    if (!this.queue) return;

    // Fetch PENDING rows with FOR UPDATE SKIP LOCKED (raw SQL — not natively
    // exposed by TypeORM lock API). Allows multiple pollers safely.
    const rows = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.query<IntegrationOutbox[]>(
        `
        SELECT id, aggregate_type AS "aggregateType", aggregate_id AS "aggregateId",
               event_type AS "eventType", payload, status, attempts,
               created_at AS "createdAt", processed_at AS "processedAt",
               last_error AS "lastError"
        FROM integration_outbox
        WHERE status = $1
        ORDER BY created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
        `,
        [OutboxStatus.PENDING, OutboxPollerService.BATCH_SIZE],
      );

      if (locked.length === 0) return locked;

      const ids = locked.map((i) => i.id);
      await manager.query(
        `UPDATE integration_outbox SET status = $1 WHERE id = ANY($2::uuid[])`,
        [OutboxStatus.PROCESSING, ids],
      );

      return locked;
    });

    for (const item of rows) {
      try {
        await this.queue.add(item.eventType, item, {
          jobId: item.id, // dedup on retry
          attempts: 3,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        });
        this.logger.debug(
          `Dispatched outbox item ${item.id} (${item.eventType})`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to enqueue outbox ${item.id}: ${msg}`);
        // Return to PENDING to retry on next poll
        await this.outboxRepo
          .createQueryBuilder()
          .update()
          .set({
            status: OutboxStatus.PENDING,
            attempts: () => 'attempts + 1',
            lastError: msg,
          })
          .where('id = :id', { id: item.id })
          .execute();
      }
    }
  }

  /**
   * Called by the processor on successful completion of a job.
   */
  async markProcessed(outboxId: string): Promise<void> {
    await this.outboxRepo
      .createQueryBuilder()
      .update()
      .set({ status: OutboxStatus.PROCESSED, processedAt: new Date() })
      .where('id = :id', { id: outboxId })
      .execute();
  }

  async markFailed(outboxId: string, error: string): Promise<void> {
    await this.outboxRepo
      .createQueryBuilder()
      .update()
      .set({
        status: OutboxStatus.FAILED,
        lastError: error,
        attempts: () => 'attempts + 1',
      })
      .where('id = :id', { id: outboxId })
      .execute();
  }
}
