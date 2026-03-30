import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BypassEvent, BypassEventType, BypassEventStatus } from './entities/bypass-event.entity';
import { Trip } from '../trips/entities/trip.entity';
import { TripStatus } from '../../shared/enums/trip-status.enum';

@Injectable()
export class AntiBypassService {
  private readonly logger = new Logger(AntiBypassService.name);

  constructor(
    @InjectRepository(BypassEvent)
    private readonly bypassEventRepository: Repository<BypassEvent>,
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
  ) {}

  /**
   * Registra un evento de riesgo de bypass.
   */
  async registerEvent(data: {
    userId: string;
    relatedUserId?: string;
    tripId?: string;
    type: BypassEventType;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<BypassEvent> {
    const event = this.bypassEventRepository.create({
      userId: data.userId,
      relatedUserId: data.relatedUserId ?? null,
      tripId: data.tripId ?? null,
      type: data.type,
      description: data.description ?? null,
      metadata: data.metadata ?? {},
    });

    const saved = await this.bypassEventRepository.save(event);

    this.logger.warn(
      `Bypass event: ${data.type} | user: ${data.userId} | related: ${data.relatedUserId ?? 'none'} | trip: ${data.tripId ?? 'none'}`,
    );

    return saved;
  }

  /**
   * Detecta si un dador repite el mismo chofer fuera de la plataforma.
   * Heurística: si un dador tuvo viajes con un chofer en la app y luego
   * ese chofer no aparece más pero el dador sigue pidiendo viajes al mismo destino.
   */
  async detectRepeatedDriverPattern(requesterId: string): Promise<{
    suspicious: boolean;
    patterns: Array<{ driverId: string; tripCount: number; lastTripDate: Date }>;
  }> {
    // Buscar los drivers más frecuentes del dador
    const driverFrequency = await this.tripRepository
      .createQueryBuilder('t')
      .select('t.driver_id', 'driverId')
      .addSelect('COUNT(*)', 'tripCount')
      .addSelect('MAX(t.delivered_at)', 'lastTripDate')
      .where('t.requester_id = :requesterId', { requesterId })
      .andWhere('t.driver_id IS NOT NULL')
      .andWhere('t.status = :status', { status: TripStatus.DELIVERED })
      .groupBy('t.driver_id')
      .having('COUNT(*) >= 3')
      .orderBy('"tripCount"', 'DESC')
      .getRawMany();

    const patterns = driverFrequency.map((row) => ({
      driverId: row.driverId,
      tripCount: Number(row.tripCount),
      lastTripDate: new Date(row.lastTripDate),
    }));

    // Si hay drivers con 3+ viajes y el último fue hace más de 30 días,
    // podría indicar que se pasaron a operar por fuera
    const suspicious = patterns.some((p) => {
      const daysSinceLastTrip =
        (Date.now() - p.lastTripDate.getTime()) / (1000 * 60 * 60 * 24);
      return p.tripCount >= 3 && daysSinceLastTrip > 30;
    });

    return { suspicious, patterns };
  }

  /**
   * Obtener eventos de bypass con filtros.
   */
  async getEvents(filters: {
    userId?: string;
    type?: BypassEventType;
    status?: BypassEventStatus;
    page?: number;
    limit?: number;
  }): Promise<{ items: BypassEvent[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const qb = this.bypassEventRepository
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'user')
      .leftJoinAndSelect('e.relatedUser', 'relatedUser');

    if (filters.userId) {
      qb.andWhere('(e.user_id = :userId OR e.related_user_id = :userId)', {
        userId: filters.userId,
      });
    }

    if (filters.type) {
      qb.andWhere('e.type = :type', { type: filters.type });
    }

    if (filters.status) {
      qb.andWhere('e.status = :status', { status: filters.status });
    }

    qb.orderBy('e.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * Revisar un evento de bypass (admin).
   */
  async reviewEvent(
    eventId: string,
    adminId: string,
    status: BypassEventStatus,
    adminNotes?: string,
  ): Promise<BypassEvent> {
    const event = await this.bypassEventRepository.findOne({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(`Evento '${eventId}' no encontrado`);
    }

    event.status = status;
    event.reviewedAt = new Date();
    event.reviewedById = adminId;
    if (adminNotes) event.adminNotes = adminNotes;

    return this.bypassEventRepository.save(event);
  }

  /**
   * Contar eventos de bypass de un usuario.
   */
  async getUserBypassCount(userId: string): Promise<{
    total: number;
    confirmed: number;
  }> {
    const [total, confirmed] = await Promise.all([
      this.bypassEventRepository.count({ where: { userId } }),
      this.bypassEventRepository.count({
        where: { userId, status: BypassEventStatus.CONFIRMED },
      }),
    ]);

    return { total, confirmed };
  }
}
