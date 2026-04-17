import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FuelAdjustmentService } from '../services/fuel-adjustment.service';
import { FeatureFlagService } from '../services/feature-flag.service';

/**
 * Cron that expires PROPOSED adjustments whose auto_apply_deadline
 * has passed without a dador response.
 *
 * Runs every 5 minutes by default. See ADR-004 and POLICIES.md §3.
 */
@Injectable()
export class AutoApplyDeadlineCron {
  private readonly logger = new Logger(AutoApplyDeadlineCron.name);

  constructor(
    private readonly adjustmentService: FuelAdjustmentService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'fuel-adjustment-deadline' })
  async processExpiredDeadlines(): Promise<void> {
    const enabled = await this.featureFlags.isEnabled('FUEL_TRACKING_ENABLED');
    if (!enabled) return;

    try {
      const expired = await this.adjustmentService.processExpiredDeadlines();
      if (expired > 0) {
        this.logger.log(`Expired ${expired} PROPOSED adjustment(s) past deadline`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Deadline cron failed: ${msg}`);
    }
  }
}
