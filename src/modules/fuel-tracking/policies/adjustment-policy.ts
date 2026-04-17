import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingParameter } from '../../pricing/entities/pricing-parameter.entity';
import { AdjustmentPolicy } from '../../../shared/enums/adjustment-policy.enum';

export interface PolicyThresholds {
  silentPct: number;
  explicitPct: number;
  graceWindowMinutes: number;
  autoApplyDeadlineHours: number;
  realtimeMinDistanceKm: number;
}

const DEFAULTS: PolicyThresholds = {
  silentPct: 0.03,
  explicitPct: 0.1,
  graceWindowMinutes: 30,
  autoApplyDeadlineHours: 24,
  realtimeMinDistanceKm: 50,
};

/**
 * Resolves the policy (SILENT / INFORMATIVE / EXPLICIT) based on the
 * magnitude of the price change, and provides runtime thresholds.
 * See ADR-004, ADR-005, POLICIES.md.
 */
@Injectable()
export class AdjustmentPolicyResolver {
  constructor(
    @InjectRepository(PricingParameter)
    private readonly paramRepo: Repository<PricingParameter>,
  ) {}

  async getThresholds(): Promise<PolicyThresholds> {
    const keys = [
      'fuel_threshold_silent_pct',
      'fuel_threshold_explicit_pct',
      'fuel_grace_window_minutes',
      'fuel_auto_apply_deadline_hours',
      'fuel_realtime_min_distance_km',
    ];
    const rows = await this.paramRepo
      .createQueryBuilder('p')
      .where('p.key IN (:...keys)', { keys })
      .getMany();

    const map = new Map<string, number>();
    for (const r of rows) {
      const n = Number(r.value);
      if (Number.isFinite(n)) map.set(r.key, n);
    }

    return {
      silentPct: map.get('fuel_threshold_silent_pct') ?? DEFAULTS.silentPct,
      explicitPct: map.get('fuel_threshold_explicit_pct') ?? DEFAULTS.explicitPct,
      graceWindowMinutes:
        map.get('fuel_grace_window_minutes') ?? DEFAULTS.graceWindowMinutes,
      autoApplyDeadlineHours:
        map.get('fuel_auto_apply_deadline_hours') ?? DEFAULTS.autoApplyDeadlineHours,
      realtimeMinDistanceKm:
        map.get('fuel_realtime_min_distance_km') ?? DEFAULTS.realtimeMinDistanceKm,
    };
  }

  /**
   * Classifies a price change into a policy based on its absolute percentage.
   */
  resolvePolicy(
    pctChangeAbs: number,
    thresholds: PolicyThresholds,
  ): AdjustmentPolicy {
    if (pctChangeAbs <= thresholds.silentPct) return AdjustmentPolicy.SILENT;
    if (pctChangeAbs <= thresholds.explicitPct) return AdjustmentPolicy.INFORMATIVE;
    return AdjustmentPolicy.EXPLICIT;
  }

  /**
   * Returns true if the trip is within the grace window post-acceptance,
   * meaning adjustments should be skipped.
   */
  isWithinGraceWindow(
    acceptedAt: Date | null,
    graceWindowMinutes: number,
    now: Date = new Date(),
  ): boolean {
    if (!acceptedAt) return true; // not yet accepted, skip
    const elapsedMin = (now.getTime() - acceptedAt.getTime()) / 60000;
    return elapsedMin < graceWindowMinutes;
  }
}
