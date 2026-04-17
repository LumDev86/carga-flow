import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TripFuelAdjustment } from '../entities/trip-fuel-adjustment.entity';
import { TripFuelSnapshot } from '../entities/trip-fuel-snapshot.entity';
import { Trip } from '../../trips/entities/trip.entity';
import { AdjustmentStatus } from '../../../shared/enums/adjustment-status.enum';
import { AdjustmentPolicy } from '../../../shared/enums/adjustment-policy.enum';

export interface TripFuelTrackingView {
  trip: {
    id: string;
    pricingMode: string;
    price: number;
    baseFuelCost: number | null;
    totalFuelAdjustment: number;
    actualFinalAmount: number | null;
  };
  snapshot: TripFuelSnapshot | null;
  adjustments: TripFuelAdjustment[];
}

export interface ListAdjustmentsOptions {
  status?: AdjustmentStatus;
  policy?: AdjustmentPolicy;
  tripId?: string;
  triggeringPriceId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

/**
 * Read side for trip fuel tracking data. Used by mobile app (dador) and
 * admin CRM for listings.
 */
@Injectable()
export class FuelAdjustmentQueryService {
  constructor(
    @InjectRepository(TripFuelAdjustment)
    private readonly adjRepo: Repository<TripFuelAdjustment>,
    @InjectRepository(TripFuelSnapshot)
    private readonly snapRepo: Repository<TripFuelSnapshot>,
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
  ) {}

  async getTrackingView(tripId: string): Promise<TripFuelTrackingView | null> {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) return null;

    const snapshot = await this.snapRepo.findOne({ where: { tripId } });
    const adjustments = await this.adjRepo.find({
      where: { tripId },
      order: { createdAt: 'ASC' },
    });

    return {
      trip: {
        id: trip.id,
        pricingMode: trip.pricingMode,
        price: Number(trip.price),
        baseFuelCost: trip.baseFuelCost != null ? Number(trip.baseFuelCost) : null,
        totalFuelAdjustment: Number(trip.totalFuelAdjustment),
        actualFinalAmount:
          trip.actualFinalAmount != null ? Number(trip.actualFinalAmount) : null,
      },
      snapshot,
      adjustments,
    };
  }

  async listAdjustments(opts: ListAdjustmentsOptions) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

    const qb = this.adjRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.trip', 'trip')
      .leftJoinAndSelect('a.responder', 'responder')
      .orderBy('a.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (opts.status) qb.andWhere('a.status = :s', { s: opts.status });
    if (opts.policy) qb.andWhere('a.policyApplied = :p', { p: opts.policy });
    if (opts.tripId) qb.andWhere('a.tripId = :t', { t: opts.tripId });
    if (opts.triggeringPriceId) {
      qb.andWhere('a.triggeringPriceHistoryId = :tp', {
        tp: opts.triggeringPriceId,
      });
    }
    if (opts.from) qb.andWhere('a.createdAt >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('a.createdAt <= :to', { to: opts.to });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findAdjustmentById(id: string): Promise<TripFuelAdjustment | null> {
    return this.adjRepo.findOne({
      where: { id },
      relations: ['trip', 'responder', 'triggeringPriceHistory', 'snapshot'],
    });
  }
}
