import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { TariffRate } from './entities/tariff-rate.entity';
import { TransportType } from '../../shared/enums/transport-type.enum';

const TARIFF_CACHE_KEY = 'tariffs:active';
const TARIFF_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class TariffService {
  private readonly logger = new Logger(TariffService.name);

  constructor(
    @InjectRepository(TariffRate)
    private readonly tariffRepository: Repository<TariffRate>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getActiveTariffs(): Promise<TariffRate[]> {
    const cached = await this.cacheManager.get<TariffRate[]>(TARIFF_CACHE_KEY);
    if (cached) return cached;

    const tariffs = await this.tariffRepository.find({
      where: { isActive: true },
      order: { pricePerKm: 'ASC' },
    });

    await this.cacheManager.set(TARIFF_CACHE_KEY, tariffs, TARIFF_CACHE_TTL);
    return tariffs;
  }

  async getTariffForTransport(
    transportType: TransportType,
  ): Promise<TariffRate | null> {
    const tariffs = await this.getActiveTariffs();
    return tariffs.find((t) => t.transportType === transportType) || null;
  }

  async updateTariff(
    id: string,
    data: { pricePerKm?: number; commissionRate?: number },
  ): Promise<TariffRate> {
    await this.tariffRepository.update(id, data);
    await this.cacheManager.del(TARIFF_CACHE_KEY);
    return this.tariffRepository.findOneOrFail({ where: { id } });
  }
}
