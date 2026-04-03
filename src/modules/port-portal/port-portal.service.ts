import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Trip } from '../trips/entities/trip.entity';
import { TripDocument } from '../trips/entities/trip-document.entity';
import { TripIncident } from '../trips/entities/trip-incident.entity';
import { User } from '../users/entities/user.entity';
import { Port } from '../ports/entities/port.entity';
import { CpeRecord } from '../cpe/entities/cpe-record.entity';
import { TripStatus } from '../../shared/enums/trip-status.enum';
import { ArrivalStatus } from '../../shared/enums/arrival-status.enum';
import { PortTripFiltersDto, TripDirection } from './dto/port-trip-filters.dto';
import { PortDashboardDto, PortStatsDto } from './dto/port-dashboard.dto';
import { UpdateArrivalStatusDto } from './dto/update-arrival-status.dto';
import { TripsService } from '../trips/trips.service';
import { EventsGateway } from '../events/events.gateway';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class PortPortalService {
  private readonly logger = new Logger(PortPortalService.name);

  constructor(
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Port)
    private readonly portRepository: Repository<Port>,
    @InjectRepository(TripDocument)
    private readonly tripDocumentRepository: Repository<TripDocument>,
    @InjectRepository(TripIncident)
    private readonly tripIncidentRepository: Repository<TripIncident>,
    @InjectRepository(CpeRecord)
    private readonly cpeRecordRepository: Repository<CpeRecord>,
    private readonly tripsService: TripsService,
    private readonly eventsGateway: EventsGateway,
    private readonly notificationService: NotificationService,
  ) {}

  async getMyPort(portId: string): Promise<Port> {
    if (!portId) {
      throw new BadRequestException('Tu usuario no tiene un puerto asociado');
    }
    const port = await this.portRepository.findOne({ where: { id: portId } });
    if (!port) {
      throw new NotFoundException('Puerto no encontrado');
    }
    return port;
  }

  async updateMyPort(portId: string, updates: { notes?: string }): Promise<Port> {
    const port = await this.getMyPort(portId);
    if (updates.notes !== undefined) {
      port.notes = updates.notes;
    }
    return this.portRepository.save(port);
  }

  async getDashboard(portId: string): Promise<PortDashboardDto> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const portCondition = new Brackets((qb) => {
      qb.where('trip.originPortId = :portId', { portId })
        .orWhere('trip.destinationPortId = :portId', { portId });
    });

    const [tripsToday, tripsThisWeek, tripsThisMonth, pendingUnloads, arrivalsToday, departuresToday, demoradosToday, rechazadosToday] =
      await Promise.all([
        this.tripRepository
          .createQueryBuilder('trip')
          .where(portCondition)
          .andWhere('trip.createdAt >= :startOfDay', { startOfDay })
          .getCount(),
        this.tripRepository
          .createQueryBuilder('trip')
          .where(portCondition)
          .andWhere('trip.createdAt >= :startOfWeek', { startOfWeek })
          .getCount(),
        this.tripRepository
          .createQueryBuilder('trip')
          .where(portCondition)
          .andWhere('trip.createdAt >= :startOfMonth', { startOfMonth })
          .getCount(),
        this.tripRepository
          .createQueryBuilder('trip')
          .where('trip.destinationPortId = :portId', { portId })
          .andWhere('trip.status = :delivered', { delivered: TripStatus.DELIVERED })
          .andWhere('trip.unloadConfirmedAt IS NULL')
          .getCount(),
        this.tripRepository
          .createQueryBuilder('trip')
          .where('trip.destinationPortId = :portId', { portId })
          .andWhere('trip.createdAt >= :startOfDay', { startOfDay })
          .getCount(),
        this.tripRepository
          .createQueryBuilder('trip')
          .where('trip.originPortId = :portId', { portId })
          .andWhere('trip.createdAt >= :startOfDay', { startOfDay })
          .getCount(),
        this.tripRepository
          .createQueryBuilder('trip')
          .where('trip.destinationPortId = :portId', { portId })
          .andWhere('trip.arrivalStatus = :demorado', { demorado: ArrivalStatus.DEMORADO })
          .andWhere('(trip.arrivalStatusSetAt >= :startOfDay OR trip.deliveredAt >= :startOfDay)', { startOfDay })
          .getCount(),
        this.tripRepository
          .createQueryBuilder('trip')
          .where('trip.destinationPortId = :portId', { portId })
          .andWhere('trip.arrivalStatus = :rechazado', { rechazado: ArrivalStatus.RECHAZADO })
          .andWhere('(trip.arrivalStatusSetAt >= :startOfDay OR trip.deliveredAt >= :startOfDay)', { startOfDay })
          .getCount(),
      ]);

    // Pending CPEs: trips associated with this port that have status ACCEPTED/IN_TRANSIT without a CPE
    const pendingCpes = await this.tripRepository
      .createQueryBuilder('trip')
      .leftJoin(CpeRecord, 'cpe', 'cpe.trip_id = trip.id')
      .where(portCondition)
      .andWhere('trip.status IN (:...statuses)', {
        statuses: [TripStatus.ACCEPTED, TripStatus.IN_TRANSIT],
      })
      .andWhere('cpe.id IS NULL')
      .getCount();

    return {
      tripsToday,
      tripsThisWeek,
      tripsThisMonth,
      pendingUnloads,
      pendingCpes,
      arrivalsToday,
      departuresToday,
      demoradosToday,
      rechazadosToday,
    };
  }

  async getPortTrips(
    portId: string,
    filters: PortTripFiltersDto,
  ): Promise<{ data: Trip[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const qb = this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.requester', 'requester')
      .leftJoinAndSelect('trip.driver', 'driver');

    // Direction filter
    if (filters.direction === TripDirection.INCOMING) {
      qb.where('trip.destinationPortId = :portId', { portId });
    } else if (filters.direction === TripDirection.OUTGOING) {
      qb.where('trip.originPortId = :portId', { portId });
    } else {
      qb.where(
        new Brackets((sub) => {
          sub
            .where('trip.originPortId = :portId', { portId })
            .orWhere('trip.destinationPortId = :portId', { portId });
        }),
      );
    }

    if (filters.status) {
      qb.andWhere('trip.status = :status', { status: filters.status });
    }

    if (filters.cargoType) {
      qb.andWhere('trip.cargoType = :cargoType', { cargoType: filters.cargoType });
    }

    if (filters.dateFrom) {
      qb.andWhere('trip.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      qb.andWhere('trip.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }

    if (filters.search) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('trip.originAddress ILIKE :search', { search: `%${filters.search}%` })
            .orWhere('trip.destinationAddress ILIKE :search', { search: `%${filters.search}%` })
            .orWhere('trip.cargoDescription ILIKE :search', { search: `%${filters.search}%` })
            .orWhere("requester.firstName || ' ' || requester.lastName ILIKE :search", {
              search: `%${filters.search}%`,
            });
        }),
      );
    }

    qb.orderBy('trip.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getTodayTrips(portId: string): Promise<{ arrivals: Trip[]; departures: Trip[] }> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [arrivals, departures] = await Promise.all([
      this.tripRepository
        .createQueryBuilder('trip')
        .leftJoinAndSelect('trip.requester', 'requester')
        .leftJoinAndSelect('trip.driver', 'driver')
        .where('trip.destinationPortId = :portId', { portId })
        .andWhere('trip.createdAt >= :startOfDay', { startOfDay })
        .orderBy('trip.createdAt', 'DESC')
        .getMany(),
      this.tripRepository
        .createQueryBuilder('trip')
        .leftJoinAndSelect('trip.requester', 'requester')
        .leftJoinAndSelect('trip.driver', 'driver')
        .where('trip.originPortId = :portId', { portId })
        .andWhere('trip.createdAt >= :startOfDay', { startOfDay })
        .orderBy('trip.createdAt', 'DESC')
        .getMany(),
    ]);

    return { arrivals, departures };
  }

  async getTripDetail(portId: string, tripId: string): Promise<Trip> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    if (trip.originPortId !== portId && trip.destinationPortId !== portId) {
      throw new ForbiddenException('Este viaje no pertenece a tu puerto');
    }

    return trip;
  }

  async getTripTimeline(portId: string, tripId: string): Promise<any[]> {
    const trip = await this.getTripDetail(portId, tripId);
    const timeline: any[] = [];

    timeline.push({
      event: 'created',
      timestamp: trip.createdAt,
      description: 'Viaje creado',
    });

    if (trip.acceptedAt) {
      timeline.push({
        event: 'accepted',
        timestamp: trip.acceptedAt,
        description: `Aceptado por ${trip.driver?.firstName || 'conductor'} ${trip.driver?.lastName || ''}`.trim(),
      });
    }

    if (trip.pickedUpAt) {
      timeline.push({
        event: 'picked_up',
        timestamp: trip.pickedUpAt,
        description: 'Carga retirada - en tránsito',
      });
    }

    if (trip.deliveredAt) {
      timeline.push({
        event: 'delivered',
        timestamp: trip.deliveredAt,
        description: 'Carga entregada en destino',
      });
    }

    if (trip.unloadConfirmedAt) {
      timeline.push({
        event: 'unload_confirmed',
        timestamp: trip.unloadConfirmedAt,
        description: 'Descarga confirmada',
      });
    }

    if (trip.arrivalStatusSetAt) {
      const statusLabels: Record<string, string> = {
        CONFORME: 'Conforme',
        DEMORADO: 'Demorado',
        RECHAZADO: 'Rechazado',
      };
      const label = statusLabels[trip.arrivalStatus!] || trip.arrivalStatus;
      let desc = `Estado de arribo: ${label}`;
      if (trip.arrivalObservations) {
        desc += ` — ${trip.arrivalObservations}`;
      }
      timeline.push({
        event: 'arrival_status',
        timestamp: trip.arrivalStatusSetAt,
        description: desc,
      });
    }

    if (trip.cancelledAt) {
      timeline.push({
        event: 'cancelled',
        timestamp: trip.cancelledAt,
        description: 'Viaje cancelado',
      });
    }

    // Add incidents
    const incidents = await this.tripIncidentRepository.find({
      where: { tripId },
      order: { createdAt: 'ASC' },
    });
    for (const incident of incidents) {
      timeline.push({
        event: 'incident',
        timestamp: incident.createdAt,
        description: `Incidente: ${incident.type} - ${incident.description}`,
      });
    }

    // Sort by timestamp
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return timeline;
  }

  async confirmUnload(portId: string, userId: string, tripId: string): Promise<Trip> {
    const trip = await this.getTripDetail(portId, tripId);

    if (trip.destinationPortId !== portId) {
      throw new ForbiddenException('Solo el puerto destino puede confirmar la descarga');
    }

    return this.tripsService.confirmUnload(tripId, userId, portId);
  }

  async getTripDocuments(portId: string, tripId: string): Promise<TripDocument[]> {
    await this.getTripDetail(portId, tripId);
    return this.tripDocumentRepository.find({
      where: { tripId },
      order: { createdAt: 'DESC' },
    });
  }

  async getTripCpe(portId: string, tripId: string): Promise<CpeRecord | null> {
    await this.getTripDetail(portId, tripId);
    return this.cpeRecordRepository.findOne({
      where: { tripId },
      relations: ['auditLogs'],
    });
  }

  async getCpePdf(portId: string, cpeId: string): Promise<{ pdfUrl: string | null }> {
    const cpe = await this.cpeRecordRepository.findOne({
      where: { id: cpeId },
      relations: ['trip'],
    });
    if (!cpe) throw new NotFoundException('CPE no encontrada');

    const trip = cpe.trip;
    if (!trip || (trip.originPortId !== portId && trip.destinationPortId !== portId)) {
      throw new ForbiddenException('Esta CPE no pertenece a tu puerto');
    }

    return { pdfUrl: cpe.pdfUrl || null };
  }

  async getTripIncidents(portId: string, tripId: string): Promise<TripIncident[]> {
    await this.getTripDetail(portId, tripId);
    return this.tripIncidentRepository.find({
      where: { tripId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateArrivalStatus(
    portId: string,
    userId: string,
    tripId: string,
    dto: UpdateArrivalStatusDto,
  ): Promise<Trip> {
    const trip = await this.getTripDetail(portId, tripId);

    if (trip.destinationPortId !== portId) {
      throw new ForbiddenException('Solo el puerto destino puede marcar el estado de arribo');
    }

    if (
      trip.status !== TripStatus.IN_TRANSIT &&
      trip.status !== TripStatus.DELIVERED
    ) {
      throw new BadRequestException(
        'Solo se puede marcar el estado de arribo en viajes EN TRÁNSITO o ENTREGADOS',
      );
    }

    if (
      (dto.arrivalStatus === ArrivalStatus.DEMORADO ||
        dto.arrivalStatus === ArrivalStatus.RECHAZADO) &&
      !dto.arrivalObservations?.trim()
    ) {
      throw new BadRequestException(
        'Las observaciones son obligatorias para estado DEMORADO o RECHAZADO',
      );
    }

    trip.arrivalStatus = dto.arrivalStatus;
    trip.arrivalObservations = dto.arrivalObservations?.trim() || null;
    trip.arrivalStatusSetAt = new Date();
    trip.arrivalStatusSetById = userId;

    const saved = await this.tripRepository.save(trip);

    // Emit WebSocket event to port room
    this.eventsGateway.emitToPort(portId, 'trip:arrival_status_updated', {
      tripId: saved.id,
      arrivalStatus: saved.arrivalStatus,
      arrivalObservations: saved.arrivalObservations,
    });

    this.logger.log(
      `Arrival status set to ${dto.arrivalStatus} for trip ${tripId} by user ${userId}`,
    );

    // Crear notificaciones para usuarios del puerto
    const portUsers = await this.userRepository.find({ where: { portId } });
    for (const pu of portUsers) {
      if (pu.id !== userId) {
        await this.notificationService.create(
          pu.id,
          'trip:arrival_status',
          `Estado de arribo actualizado`,
          `Viaje marcado como ${dto.arrivalStatus}`,
          { tripId, arrivalStatus: dto.arrivalStatus },
        );
      }
    }

    return saved;
  }

  async markFletePaid(portId: string, userId: string, tripId: string): Promise<Trip> {
    const trip = await this.getTripDetail(portId, tripId);

    if (trip.fleteStatus === 'PAID') {
      throw new BadRequestException('El flete ya fue marcado como pagado');
    }

    trip.fleteStatus = 'PAID';
    trip.fletePaidAt = new Date();
    trip.fletePaidById = userId;

    const saved = await this.tripRepository.save(trip);

    this.eventsGateway.emitToPort(portId, 'trip:flete_paid', {
      tripId: saved.id,
      fletePaidAt: saved.fletePaidAt,
    });

    this.logger.log(`Flete marked as paid for trip ${tripId} by user ${userId}`);

    // Notificar a usuarios del puerto
    const portUsers = await this.userRepository.find({ where: { portId } });
    for (const pu of portUsers) {
      if (pu.id !== userId) {
        await this.notificationService.create(
          pu.id,
          'trip:flete_paid',
          'Flete pagado',
          `Se confirmó el pago del flete del viaje`,
          { tripId },
        );
      }
    }

    return saved;
  }

  async getPendingFlete(portId: string): Promise<Trip[]> {
    return this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.requester', 'requester')
      .leftJoinAndSelect('trip.driver', 'driver')
      .where(
        new Brackets((qb) => {
          qb.where('trip.originPortId = :portId', { portId })
            .orWhere('trip.destinationPortId = :portId', { portId });
        }),
      )
      .andWhere('trip.status = :status', { status: TripStatus.DELIVERED })
      .andWhere("(trip.paymentStatus = 'pending_flete' OR trip.paymentStatus = 'pending')")
      .orderBy('trip.deliveredAt', 'ASC')
      .getMany();
  }

  async getPortStats(portId: string): Promise<PortStatsDto> {
    // Trips by month (last 12 months)
    const tripsByMonth = await this.tripRepository
      .createQueryBuilder('trip')
      .select("TO_CHAR(trip.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where(
        new Brackets((qb) => {
          qb.where('trip.originPortId = :portId', { portId }).orWhere(
            'trip.destinationPortId = :portId',
            { portId },
          );
        }),
      )
      .andWhere("trip.createdAt >= NOW() - INTERVAL '12 months'")
      .groupBy("TO_CHAR(trip.createdAt, 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany();

    // Average rating given by this port's users
    const ratingResult = await this.tripRepository
      .createQueryBuilder('trip')
      .select('AVG(trip.rating)', 'avg')
      .where(
        new Brackets((qb) => {
          qb.where('trip.originPortId = :portId', { portId }).orWhere(
            'trip.destinationPortId = :portId',
            { portId },
          );
        }),
      )
      .andWhere('trip.rating IS NOT NULL')
      .getRawOne();

    // Top drivers
    const topDrivers = await this.tripRepository
      .createQueryBuilder('trip')
      .leftJoin('trip.driver', 'driver')
      .select('trip.driverId', 'driverId')
      .addSelect("driver.firstName || ' ' || driver.lastName", 'driverName')
      .addSelect('COUNT(*)', 'tripCount')
      .where(
        new Brackets((qb) => {
          qb.where('trip.originPortId = :portId', { portId }).orWhere(
            'trip.destinationPortId = :portId',
            { portId },
          );
        }),
      )
      .andWhere('trip.driverId IS NOT NULL')
      .andWhere('trip.status = :delivered', { delivered: TripStatus.DELIVERED })
      .groupBy('trip.driverId')
      .addGroupBy('driver.firstName')
      .addGroupBy('driver.lastName')
      .orderBy('"tripCount"', 'DESC')
      .limit(10)
      .getRawMany();

    // Cargo type breakdown
    const cargoTypeBreakdown = await this.tripRepository
      .createQueryBuilder('trip')
      .select('trip.cargoType', 'cargoType')
      .addSelect('COUNT(*)', 'count')
      .where(
        new Brackets((qb) => {
          qb.where('trip.originPortId = :portId', { portId }).orWhere(
            'trip.destinationPortId = :portId',
            { portId },
          );
        }),
      )
      .groupBy('trip.cargoType')
      .getRawMany();

    // Average delivery time in hours (for delivered trips)
    const avgTimeResult = await this.tripRepository
      .createQueryBuilder('trip')
      .select(
        'AVG(EXTRACT(EPOCH FROM (trip.deliveredAt - trip.pickedUpAt)) / 3600)',
        'avgHours',
      )
      .where(
        new Brackets((qb) => {
          qb.where('trip.originPortId = :portId', { portId }).orWhere(
            'trip.destinationPortId = :portId',
            { portId },
          );
        }),
      )
      .andWhere('trip.status = :delivered', { delivered: TripStatus.DELIVERED })
      .andWhere('trip.deliveredAt IS NOT NULL')
      .andWhere('trip.pickedUpAt IS NOT NULL')
      .getRawOne();

    return {
      tripsByMonth: tripsByMonth.map((r) => ({
        month: r.month,
        count: Number(r.count),
      })),
      averageRatingGiven: ratingResult?.avg ? Math.round(Number(ratingResult.avg) * 100) / 100 : 0,
      topDrivers: topDrivers.map((r) => ({
        driverId: r.driverId,
        driverName: r.driverName?.trim() || 'Conductor',
        tripCount: Number(r.tripCount),
      })),
      cargoTypeBreakdown: cargoTypeBreakdown.map((r) => ({
        cargoType: r.cargoType,
        count: Number(r.count),
      })),
      avgDeliveryTimeHours: avgTimeResult?.avgHours
        ? Math.round(Number(avgTimeResult.avgHours) * 100) / 100
        : 0,
    };
  }
}
