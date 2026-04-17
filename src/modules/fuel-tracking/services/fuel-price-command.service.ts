import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FuelPriceHistory } from '../entities/fuel-price-history.entity';
import { IntegrationOutbox } from '../entities/integration-outbox.entity';
import { RegisterFuelPriceDto } from '../dto/register-fuel-price.dto';
import { FuelSource } from '../../../shared/enums/fuel-source.enum';
import { FuelType } from '../../../shared/enums/fuel-type.enum';

export interface RegisterPriceResult {
  record: FuelPriceHistory;
  wasIdempotentHit: boolean;
}

/**
 * Command side for fuel price changes.
 *
 * Responsibilities:
 *   - Validate effectiveFrom bounds
 *   - Look up previous price for pct delta
 *   - Insert fuel_price_history + integration_outbox in same TX
 *   - Honor idempotency-key (returns existing row on retry)
 *
 * See ADR-002, ADR-003.
 */
@Injectable()
export class FuelPriceCommandService {
  private readonly logger = new Logger(FuelPriceCommandService.name);
  private static readonly MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
  private static readonly MAX_PAST_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(FuelPriceHistory)
    private readonly historyRepo: Repository<FuelPriceHistory>,
  ) {}

  async registerPriceChange(
    adminUserId: string,
    dto: RegisterFuelPriceDto,
    idempotencyKey: string,
  ): Promise<RegisterPriceResult> {
    // Idempotency check (outside TX to keep it cheap)
    const existing = await this.historyRepo.findOne({
      where: { idempotencyKey },
    });
    if (existing) {
      this.logger.log(
        `Idempotent replay of fuel price change ${existing.id} (key=${idempotencyKey})`,
      );
      return { record: existing, wasIdempotentHit: true };
    }

    const effectiveFrom = this.parseAndValidateEffectiveFrom(dto.effectiveFrom);
    const source = dto.source ?? FuelSource.MANUAL_ADMIN;

    // Atomic insert: history + outbox
    return await this.dataSource.transaction(async (manager) => {
      const previousPrice = await this.getPriorPrice(
        manager,
        dto.fuelType,
        effectiveFrom,
      );

      const historyRepo = manager.getRepository(FuelPriceHistory);
      const outboxRepo = manager.getRepository(IntegrationOutbox);

      const record = historyRepo.create({
        fuelType: dto.fuelType,
        pricePerLiter: dto.pricePerLiter.toFixed(2),
        effectiveFrom,
        source,
        sourceRef: dto.sourceRef ?? null,
        createdBy: adminUserId,
        notes: dto.notes ?? null,
        idempotencyKey,
      });

      const saved = await historyRepo.save(record);

      const pctChange =
        previousPrice != null && previousPrice > 0
          ? (dto.pricePerLiter - previousPrice) / previousPrice
          : null;

      const event = outboxRepo.create({
        aggregateType: 'fuel_price',
        aggregateId: saved.id,
        eventType: 'fuel.price.changed',
        payload: {
          priceHistoryId: saved.id,
          fuelType: saved.fuelType,
          oldPrice: previousPrice,
          newPrice: dto.pricePerLiter,
          pctChange,
          effectiveFrom: effectiveFrom.toISOString(),
          source,
          registeredBy: adminUserId,
        },
      });

      await outboxRepo.save(event);

      this.logger.log(
        `Fuel price registered: type=${saved.fuelType} price=${saved.pricePerLiter} ` +
          `oldPrice=${previousPrice} pctChange=${pctChange} by=${adminUserId}`,
      );

      return { record: saved, wasIdempotentHit: false };
    });
  }

  private parseAndValidateEffectiveFrom(raw?: string): Date {
    if (!raw) return new Date();
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Invalid effectiveFrom date');
    }
    const now = Date.now();
    const delta = d.getTime() - now;
    if (delta > FuelPriceCommandService.MAX_FUTURE_MS) {
      throw new BadRequestException(
        'effectiveFrom cannot be more than 24 hours in the future',
      );
    }
    if (-delta > FuelPriceCommandService.MAX_PAST_MS) {
      throw new BadRequestException(
        'effectiveFrom cannot be more than 7 days in the past',
      );
    }
    return d;
  }

  private async getPriorPrice(
    manager: import('typeorm').EntityManager,
    fuelType: FuelType,
    asOf: Date,
  ): Promise<number | null> {
    const row = await manager
      .getRepository(FuelPriceHistory)
      .createQueryBuilder('h')
      .where('h.fuelType = :fuelType', { fuelType })
      .andWhere('h.effectiveFrom < :asOf', { asOf })
      .orderBy('h.effectiveFrom', 'DESC')
      .limit(1)
      .getOne();

    if (!row) return null;
    const n = Number(row.pricePerLiter);
    return Number.isFinite(n) ? n : null;
  }
}
