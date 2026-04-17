import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { FeatureFlag } from '../entities/feature-flag.entity';

/**
 * DB-backed feature flags with 30s cache TTL (ADR-010).
 *
 * Note: in single-pod deployments, local cache is sufficient. When scaling
 * to multiple pods, add ioredis pub/sub invalidation (subscribe to
 * 'feature_flag:updated' channel and drop cache key). Deferred to V2.
 */
@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);
  private static readonly TTL_MS = 30_000;
  private static readonly CACHE_PREFIX = 'ff:';

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @InjectRepository(FeatureFlag)
    private readonly repo: Repository<FeatureFlag>,
  ) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const cacheKey = FeatureFlagService.CACHE_PREFIX + key;
    const cached = await this.cache.get<T>(cacheKey);
    if (cached !== undefined && cached !== null) {
      return cached;
    }
    const row = await this.repo.findOne({ where: { key } });
    const value = (row?.value as T | undefined) ?? null;
    if (value !== null) {
      await this.cache.set(cacheKey, value, FeatureFlagService.TTL_MS);
    }
    return value;
  }

  async isEnabled(key: string): Promise<boolean> {
    const v = await this.get<boolean>(key);
    return v === true;
  }

  async getNumber(key: string, fallback = 0): Promise<number> {
    const v = await this.get<number>(key);
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }

  /**
   * Stable per-user rollout decision based on SHA-256 hash of userId.
   * The same user + same pct always yields the same answer.
   */
  async isUserInRollout(userId: string, pctKey: string): Promise<boolean> {
    const pct = await this.getNumber(pctKey, 0);
    if (pct >= 100) return true;
    if (pct <= 0) return false;
    const hex = createHash('sha256').update(userId).digest('hex').slice(0, 8);
    const hashInt = parseInt(hex, 16);
    return hashInt % 100 < pct;
  }

  /** Write path — used by admin controllers. Invalidates cache. */
  async set(key: string, value: unknown, updatedBy: string | null): Promise<FeatureFlag> {
    const existing = await this.repo.findOne({ where: { key } });
    if (existing) {
      existing.value = value;
      existing.updatedBy = updatedBy;
      existing.updatedAt = new Date();
      const saved = await this.repo.save(existing);
      await this.cache.del(FeatureFlagService.CACHE_PREFIX + key);
      this.logger.log(`Feature flag updated: ${key} = ${JSON.stringify(value)}`);
      return saved;
    }
    const created = this.repo.create({
      key,
      value,
      updatedBy,
    });
    const saved = await this.repo.save(created);
    this.logger.log(`Feature flag created: ${key} = ${JSON.stringify(value)}`);
    return saved;
  }

  async listAll(): Promise<FeatureFlag[]> {
    return this.repo.find({ order: { key: 'ASC' } });
  }
}
