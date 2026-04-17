import { FeatureFlagService } from './feature-flag.service';
import type { Cache } from 'cache-manager';
import type { Repository } from 'typeorm';
import type { FeatureFlag } from '../entities/feature-flag.entity';

function makeCache(): Cache {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: unknown) => {
      store.set(k, v);
      return v;
    }),
    del: jest.fn(async (k: string) => {
      store.delete(k);
    }),
  } as unknown as Cache;
}

function makeRepo(initial: Record<string, unknown>) {
  const store = new Map<string, FeatureFlag>();
  for (const [k, v] of Object.entries(initial)) {
    store.set(k, { key: k, value: v } as FeatureFlag);
  }
  return {
    findOne: jest.fn(async ({ where }: { where: { key: string } }) => store.get(where.key) ?? null),
  } as unknown as Repository<FeatureFlag>;
}

describe('FeatureFlagService', () => {
  describe('get / isEnabled', () => {
    it('returns false for unknown flag', async () => {
      const svc = new FeatureFlagService(makeCache(), makeRepo({}));
      expect(await svc.isEnabled('MISSING')).toBe(false);
    });

    it('returns true when flag value is literal true', async () => {
      const svc = new FeatureFlagService(
        makeCache(),
        makeRepo({ FUEL_TRACKING_ENABLED: true }),
      );
      expect(await svc.isEnabled('FUEL_TRACKING_ENABLED')).toBe(true);
    });

    it('returns false when flag value is false', async () => {
      const svc = new FeatureFlagService(
        makeCache(),
        makeRepo({ FUEL_TRACKING_ENABLED: false }),
      );
      expect(await svc.isEnabled('FUEL_TRACKING_ENABLED')).toBe(false);
    });
  });

  describe('isUserInRollout', () => {
    it('returns false when pct is 0', async () => {
      const svc = new FeatureFlagService(makeCache(), makeRepo({ pct: 0 }));
      expect(await svc.isUserInRollout('user-1', 'pct')).toBe(false);
    });

    it('returns true when pct is 100', async () => {
      const svc = new FeatureFlagService(makeCache(), makeRepo({ pct: 100 }));
      expect(await svc.isUserInRollout('user-1', 'pct')).toBe(true);
    });

    it('returns same answer for same userId across calls', async () => {
      const svc = new FeatureFlagService(makeCache(), makeRepo({ pct: 50 }));
      const r1 = await svc.isUserInRollout('stable-user', 'pct');
      const r2 = await svc.isUserInRollout('stable-user', 'pct');
      expect(r1).toBe(r2);
    });

    it('partitions roughly ~pct% of users (50% with 1000 samples)', async () => {
      const svc = new FeatureFlagService(makeCache(), makeRepo({ pct: 50 }));
      let included = 0;
      for (let i = 0; i < 1000; i++) {
        const uid = `user-${i}-${Math.random()}`;
        if (await svc.isUserInRollout(uid, 'pct')) included++;
      }
      // Expect roughly 50% ±5% (generous margin for 1000 samples)
      expect(included).toBeGreaterThan(420);
      expect(included).toBeLessThan(580);
    });

    it('increasing pct monotonically includes more users', async () => {
      const cache10 = makeCache();
      const cache50 = makeCache();
      const svc10 = new FeatureFlagService(cache10, makeRepo({ pct: 10 }));
      const svc50 = new FeatureFlagService(cache50, makeRepo({ pct: 50 }));

      const userIds = Array.from({ length: 500 }, (_, i) => `u-${i}`);
      const in10 = [];
      const in50 = [];
      for (const uid of userIds) {
        if (await svc10.isUserInRollout(uid, 'pct')) in10.push(uid);
        if (await svc50.isUserInRollout(uid, 'pct')) in50.push(uid);
      }

      // Every user in 10% should be in 50% (superset)
      for (const uid of in10) {
        expect(in50).toContain(uid);
      }
      expect(in50.length).toBeGreaterThan(in10.length);
    });
  });
});
