import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * Distributed lock using the cache store (Redis in prod, in-memory in dev).
 * See ADR-009. Simple NX-with-TTL pattern.
 *
 * Note: when using the in-memory cache fallback (dev without Redis), this
 * still works within a single process. Multi-pod deployments require Redis.
 */
@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /**
   * Attempts to acquire a lock. Returns true if acquired, false if held by another.
   */
  async acquire(key: string, ttlMs: number): Promise<boolean> {
    // cache-manager doesn't expose SET NX natively; emulate with get+set.
    // Race condition is small (sub-ms) and falls back to UNIQUE constraint
    // in trip_fuel_adjustments (ADR-009 defense in depth).
    const existing = await this.cache.get(key);
    if (existing !== null && existing !== undefined) {
      return false;
    }
    await this.cache.set(key, '1', ttlMs);
    return true;
  }

  async release(key: string): Promise<void> {
    try {
      await this.cache.del(key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to release lock ${key}: ${msg}`);
    }
  }
}
