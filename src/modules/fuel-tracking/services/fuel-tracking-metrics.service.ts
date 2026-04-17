import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationOutbox, OutboxStatus } from '../entities/integration-outbox.entity';
import { TripFuelAdjustment } from '../entities/trip-fuel-adjustment.entity';
import { AdjustmentStatus } from '../../../shared/enums/adjustment-status.enum';
import { AdjustmentPolicy } from '../../../shared/enums/adjustment-policy.enum';

interface Counter {
  value: number;
  lastUpdate: Date;
}

interface Timer {
  count: number;
  sumMs: number;
  maxMs: number;
  lastUpdate: Date;
}

/**
 * Lightweight in-memory metrics. Resets on pod restart.
 * For proper Prometheus integration, add `@willsoto/nestjs-prometheus` in V2.
 *
 * Counters incremented at key points in the recalc flow; gauges read
 * live from the DB.
 */
@Injectable()
export class FuelTrackingMetricsService {
  private counters = new Map<string, Counter>();
  private timers = new Map<string, Timer>();

  constructor(
    @InjectRepository(IntegrationOutbox)
    private readonly outboxRepo: Repository<IntegrationOutbox>,
    @InjectRepository(TripFuelAdjustment)
    private readonly adjRepo: Repository<TripFuelAdjustment>,
  ) {}

  inc(name: string, by = 1): void {
    const existing = this.counters.get(name) ?? { value: 0, lastUpdate: new Date() };
    existing.value += by;
    existing.lastUpdate = new Date();
    this.counters.set(name, existing);
  }

  record(timerName: string, durationMs: number): void {
    const existing =
      this.timers.get(timerName) ??
      { count: 0, sumMs: 0, maxMs: 0, lastUpdate: new Date() };
    existing.count += 1;
    existing.sumMs += durationMs;
    if (durationMs > existing.maxMs) existing.maxMs = durationMs;
    existing.lastUpdate = new Date();
    this.timers.set(timerName, existing);
  }

  async snapshot(): Promise<Record<string, unknown>> {
    const [outboxPending, outboxFailed, adjByStatus, adjByPolicy] = await Promise.all([
      this.outboxRepo.count({ where: { status: OutboxStatus.PENDING } }),
      this.outboxRepo.count({ where: { status: OutboxStatus.FAILED } }),
      this.groupByStatus(),
      this.groupByPolicy(),
    ]);

    const counters: Record<string, number> = {};
    for (const [k, v] of this.counters) counters[k] = v.value;

    const timers: Record<string, { count: number; avgMs: number; maxMs: number }> = {};
    for (const [k, v] of this.timers) {
      timers[k] = {
        count: v.count,
        avgMs: v.count > 0 ? v.sumMs / v.count : 0,
        maxMs: v.maxMs,
      };
    }

    return {
      generatedAt: new Date().toISOString(),
      outbox: {
        pending: outboxPending,
        failed: outboxFailed,
      },
      adjustments: {
        byStatus: adjByStatus,
        byPolicy: adjByPolicy,
      },
      counters,
      timers,
    };
  }

  private async groupByStatus(): Promise<Record<string, number>> {
    const rows = await this.adjRepo
      .createQueryBuilder('a')
      .select('a.status', 'status')
      .addSelect('COUNT(a.id)', 'count')
      .groupBy('a.status')
      .getRawMany<{ status: AdjustmentStatus; count: string }>();
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = Number(r.count);
    return out;
  }

  private async groupByPolicy(): Promise<Record<string, number>> {
    const rows = await this.adjRepo
      .createQueryBuilder('a')
      .select('a.policyApplied', 'policy')
      .addSelect('COUNT(a.id)', 'count')
      .groupBy('a.policyApplied')
      .getRawMany<{ policy: AdjustmentPolicy; count: string }>();
    const out: Record<string, number> = {};
    for (const r of rows) out[r.policy] = Number(r.count);
    return out;
  }
}
