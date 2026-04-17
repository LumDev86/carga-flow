import { AdjustmentPolicyResolver } from './adjustment-policy';
import { AdjustmentPolicy } from '../../../shared/enums/adjustment-policy.enum';
import type { Repository } from 'typeorm';
import type { PricingParameter } from '../../pricing/entities/pricing-parameter.entity';

describe('AdjustmentPolicyResolver', () => {
  function makeResolver(params: Record<string, number>) {
    const rows = Object.entries(params).map(([key, value]) => ({
      key,
      value: String(value),
    }));
    const qb = {
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    const repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as Repository<PricingParameter>;
    return new AdjustmentPolicyResolver(repo);
  }

  describe('resolvePolicy', () => {
    const resolver = makeResolver({});
    const thresholds = {
      silentPct: 0.03,
      explicitPct: 0.1,
      graceWindowMinutes: 30,
      autoApplyDeadlineHours: 24,
      realtimeMinDistanceKm: 50,
    };

    it('returns SILENT for changes at or below silentPct', () => {
      expect(resolver.resolvePolicy(0, thresholds)).toBe(AdjustmentPolicy.SILENT);
      expect(resolver.resolvePolicy(0.02, thresholds)).toBe(AdjustmentPolicy.SILENT);
      expect(resolver.resolvePolicy(0.03, thresholds)).toBe(AdjustmentPolicy.SILENT);
    });

    it('returns INFORMATIVE for changes between silent and explicit', () => {
      expect(resolver.resolvePolicy(0.04, thresholds)).toBe(
        AdjustmentPolicy.INFORMATIVE,
      );
      expect(resolver.resolvePolicy(0.0444, thresholds)).toBe(
        AdjustmentPolicy.INFORMATIVE,
      );
      expect(resolver.resolvePolicy(0.1, thresholds)).toBe(
        AdjustmentPolicy.INFORMATIVE,
      );
    });

    it('returns EXPLICIT for changes above explicitPct', () => {
      expect(resolver.resolvePolicy(0.1001, thresholds)).toBe(
        AdjustmentPolicy.EXPLICIT,
      );
      expect(resolver.resolvePolicy(0.2, thresholds)).toBe(AdjustmentPolicy.EXPLICIT);
      expect(resolver.resolvePolicy(1.0, thresholds)).toBe(AdjustmentPolicy.EXPLICIT);
    });
  });

  describe('isWithinGraceWindow', () => {
    const resolver = makeResolver({});
    const now = new Date('2026-04-17T14:00:00Z');

    it('returns true if acceptedAt is null', () => {
      expect(resolver.isWithinGraceWindow(null, 30, now)).toBe(true);
    });

    it('returns true when within grace window', () => {
      const acceptedAt = new Date(now.getTime() - 20 * 60 * 1000); // 20 min ago
      expect(resolver.isWithinGraceWindow(acceptedAt, 30, now)).toBe(true);
    });

    it('returns false when past grace window', () => {
      const acceptedAt = new Date(now.getTime() - 31 * 60 * 1000); // 31 min ago
      expect(resolver.isWithinGraceWindow(acceptedAt, 30, now)).toBe(false);
    });

    it('returns false at exact boundary (30 min elapsed)', () => {
      const acceptedAt = new Date(now.getTime() - 30 * 60 * 1000);
      expect(resolver.isWithinGraceWindow(acceptedAt, 30, now)).toBe(false);
    });
  });

  describe('getThresholds', () => {
    it('returns custom values when params are set', async () => {
      const resolver = makeResolver({
        fuel_threshold_silent_pct: 0.05,
        fuel_threshold_explicit_pct: 0.15,
        fuel_grace_window_minutes: 45,
        fuel_auto_apply_deadline_hours: 48,
        fuel_realtime_min_distance_km: 100,
      });
      const t = await resolver.getThresholds();
      expect(t).toEqual({
        silentPct: 0.05,
        explicitPct: 0.15,
        graceWindowMinutes: 45,
        autoApplyDeadlineHours: 48,
        realtimeMinDistanceKm: 100,
      });
    });

    it('falls back to defaults when params are missing', async () => {
      const resolver = makeResolver({});
      const t = await resolver.getThresholds();
      expect(t).toEqual({
        silentPct: 0.03,
        explicitPct: 0.1,
        graceWindowMinutes: 30,
        autoApplyDeadlineHours: 24,
        realtimeMinDistanceKm: 50,
      });
    });
  });
});
