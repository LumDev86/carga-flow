import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TripAlert } from './entities/trip-alert.entity';
import { Trip } from '../trips/entities/trip.entity';
import { Port } from '../ports/entities/port.entity';
import { NotificationService } from '../notifications/notification.service';
import { PushNotificationService } from '../notifications/push-notification.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateTripAlertDto } from './dto/create-trip-alert.dto';
import {
  TripAlertType,
  TripAlertPriority,
  TripAlertStatus,
} from '../../shared/enums/trip-alert.enum';
import { UserRole } from '../../shared/enums/user-role.enum';

const TRIP_ALERT_TYPE_LABELS: Record<TripAlertType, string> = {
  [TripAlertType.DEMORA_DESCARGA]: 'Demora en la descarga',
  [TripAlertType.PROBLEMA_CALIDAD]: 'Problema de calidad',
  [TripAlertType.FALTA_DOCUMENTACION]: 'Falta de documentación',
  [TripAlertType.PROBLEMA_CARGA]: 'Problema con la carga',
  [TripAlertType.URGENCIA_CLIMA]: 'Urgencia climática',
  [TripAlertType.CAMBIO_TURNO]: 'Cambio de turno',
  [TripAlertType.OTRO]: 'Otro',
};

const NOTIFICATION_TYPE_NEW = 'trip-alert:new';
const WS_EVENT_NEW = 'trip-alert:new';
const WS_EVENT_STATUS = 'trip-alert:status-changed';

@Injectable()
export class TripAlertsService {
  private readonly logger = new Logger(TripAlertsService.name);

  constructor(
    @InjectRepository(TripAlert)
    private readonly tripAlertRepository: Repository<TripAlert>,
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(Port)
    private readonly portRepository: Repository<Port>,
    private readonly notificationService: NotificationService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  // ==========================================
  // CREATE (operador de puerto)
  // ==========================================

  async createAlert(
    sentByUserId: string,
    portId: string,
    dto: CreateTripAlertDto,
  ): Promise<TripAlert> {
    if (!portId) {
      throw new BadRequestException('Tu usuario no tiene un puerto asociado');
    }

    const trip = await this.tripRepository.findOne({
      where: { id: dto.tripId },
      relations: ['requester'],
    });

    if (!trip) {
      throw new NotFoundException(`Trip '${dto.tripId}' no encontrado`);
    }

    const belongsToPort =
      trip.originPortId === portId || trip.destinationPortId === portId;
    if (!belongsToPort) {
      throw new ForbiddenException(
        'El trip no pertenece a tu puerto (ni origen ni destino)',
      );
    }

    if (!trip.requesterId) {
      throw new BadRequestException('El trip no tiene dador asociado');
    }

    const priority = dto.priority || TripAlertPriority.NORMAL;

    const alert = this.tripAlertRepository.create({
      tripId: trip.id,
      portId,
      sentByUserId,
      receiverId: trip.requesterId,
      type: dto.type,
      priority,
      message: dto.message || null,
      status: TripAlertStatus.SENT,
      sentAt: new Date(),
    });

    const saved = await this.tripAlertRepository.save(alert);

    // Side effects (no-fail: los errores no rompen la creación del registro)
    await this.fanOutNewAlert(saved, trip.requesterId, portId);

    this.logger.log(
      `TripAlert ${saved.id} creada por usuario ${sentByUserId} (puerto ${portId}) → dador ${trip.requesterId} — tipo ${dto.type}, prioridad ${priority}`,
    );

    return this.tripAlertRepository.findOneOrFail({
      where: { id: saved.id },
      relations: ['sentBy', 'port'],
    });
  }

  private async fanOutNewAlert(
    alert: TripAlert,
    receiverId: string,
    portId: string,
  ): Promise<void> {
    const label = TRIP_ALERT_TYPE_LABELS[alert.type] ?? alert.type;
    const isUrgent = alert.priority === TripAlertPriority.URGENTE;

    let portName: string | null = null;
    try {
      const port = await this.portRepository.findOne({ where: { id: portId } });
      portName = port?.name || null;
    } catch {
      portName = null;
    }

    const title = isUrgent ? `⚠ Alerta urgente del puerto` : `Alerta del puerto`;
    const bodyBase = portName ? `${portName}: ${label}` : label;
    const body = alert.message ? `${bodyBase} — ${alert.message}` : bodyBase;

    const payload = {
      alertId: alert.id,
      tripId: alert.tripId,
      alertType: alert.type,
      priority: alert.priority,
      status: alert.status,
      message: alert.message,
      portId,
      portName,
      sentAt: alert.sentAt,
    };

    // 1. Notification persistente (feed)
    try {
      await this.notificationService.create(
        receiverId,
        NOTIFICATION_TYPE_NEW,
        title,
        body,
        { ...payload, screen: 'PORT_ALERT' },
      );
    } catch (err: any) {
      this.logger.error(
        `Error creando notification persistente para alerta ${alert.id}: ${err.message}`,
      );
    }

    // 2. Push Expo
    try {
      await this.pushNotificationService.sendToUser(receiverId, {
        title,
        body,
        data: { type: 'PORT_ALERT', ...payload },
      });
    } catch (err: any) {
      this.logger.error(
        `Error enviando push para alerta ${alert.id}: ${err.message}`,
      );
    }

    // 3. WebSocket: al receiver (dador) y al puerto (eco de nueva alerta)
    this.eventsGateway.emitToUser(receiverId, WS_EVENT_NEW, payload);
    this.eventsGateway.emitToPort(portId, WS_EVENT_NEW, payload);
  }

  // ==========================================
  // LECTURA
  // ==========================================

  async getAlertsByTrip(
    tripId: string,
    userId: string,
    userRole: UserRole,
    userPortId: string | null,
  ): Promise<TripAlert[]> {
    const trip = await this.tripRepository.findOne({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`Trip '${tripId}' no encontrado`);
    }

    const isReceiver =
      (userRole === UserRole.SOLICITANTE || userRole === UserRole.PRODUCTOR) &&
      trip.requesterId === userId;
    const isPortOperator =
      userRole === UserRole.PUERTO &&
      !!userPortId &&
      (trip.originPortId === userPortId || trip.destinationPortId === userPortId);
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isReceiver && !isPortOperator && !isAdmin) {
      throw new ForbiddenException('No autorizado a ver alertas de este trip');
    }

    return this.tripAlertRepository.find({
      where: { tripId },
      relations: ['sentBy', 'port'],
      order: { sentAt: 'DESC' },
    });
  }

  async getMyAlerts(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: TripAlert[]; total: number; unreadCount: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await this.tripAlertRepository.findAndCount({
      where: { receiverId: userId },
      relations: ['sentBy', 'port', 'trip'],
      order: { sentAt: 'DESC' },
      take: limit,
      skip,
    });
    const unreadCount = await this.tripAlertRepository
      .createQueryBuilder('alert')
      .where('alert.receiver_id = :userId', { userId })
      .andWhere('alert.status IN (:...unreadStatuses)', {
        unreadStatuses: [TripAlertStatus.SENT, TripAlertStatus.DELIVERED],
      })
      .getCount();
    return { data, total, unreadCount };
  }

  // ==========================================
  // TRANSICIONES DE ESTADO
  // ==========================================

  async markAsRead(alertId: string, userId: string): Promise<TripAlert> {
    const alert = await this.tripAlertRepository.findOne({
      where: { id: alertId },
    });
    if (!alert) {
      throw new NotFoundException(`Alerta '${alertId}' no encontrada`);
    }
    if (alert.receiverId !== userId) {
      throw new ForbiddenException('Solo el destinatario puede marcar como leída');
    }
    if (alert.status === TripAlertStatus.CANCELLED) {
      throw new BadRequestException('La alerta fue cancelada');
    }
    if (
      alert.status === TripAlertStatus.SENT ||
      alert.status === TripAlertStatus.DELIVERED
    ) {
      alert.status = TripAlertStatus.READ;
      alert.readAt = new Date();
      if (!alert.deliveredAt) {
        alert.deliveredAt = alert.readAt;
      }
      await this.tripAlertRepository.save(alert);
      this.emitStatusChange(alert);
    }
    return alert;
  }

  async acknowledge(alertId: string, userId: string): Promise<TripAlert> {
    const alert = await this.tripAlertRepository.findOne({
      where: { id: alertId },
    });
    if (!alert) {
      throw new NotFoundException(`Alerta '${alertId}' no encontrada`);
    }
    if (alert.receiverId !== userId) {
      throw new ForbiddenException('Solo el destinatario puede confirmar recepción');
    }
    if (alert.status === TripAlertStatus.CANCELLED) {
      throw new BadRequestException('La alerta fue cancelada');
    }
    if (alert.status !== TripAlertStatus.ACKNOWLEDGED) {
      const now = new Date();
      alert.status = TripAlertStatus.ACKNOWLEDGED;
      alert.acknowledgedAt = now;
      if (!alert.readAt) alert.readAt = now;
      if (!alert.deliveredAt) alert.deliveredAt = now;
      await this.tripAlertRepository.save(alert);
      this.emitStatusChange(alert);
    }
    return alert;
  }

  async cancel(
    alertId: string,
    userId: string,
    reason?: string,
  ): Promise<TripAlert> {
    const alert = await this.tripAlertRepository.findOne({
      where: { id: alertId },
    });
    if (!alert) {
      throw new NotFoundException(`Alerta '${alertId}' no encontrada`);
    }
    if (alert.sentByUserId !== userId) {
      throw new ForbiddenException('Solo quien envió la alerta puede cancelarla');
    }
    if (alert.status !== TripAlertStatus.SENT) {
      throw new BadRequestException(
        'Solo se pueden cancelar alertas que aún no fueron leídas',
      );
    }
    alert.status = TripAlertStatus.CANCELLED;
    alert.cancelledAt = new Date();
    alert.cancelReason = reason || null;
    await this.tripAlertRepository.save(alert);
    this.emitStatusChange(alert);
    return alert;
  }

  private emitStatusChange(alert: TripAlert): void {
    const payload = {
      alertId: alert.id,
      tripId: alert.tripId,
      status: alert.status,
      readAt: alert.readAt,
      acknowledgedAt: alert.acknowledgedAt,
      cancelledAt: alert.cancelledAt,
      cancelReason: alert.cancelReason,
    };
    this.eventsGateway.emitToPort(alert.portId, WS_EVENT_STATUS, payload);
    this.eventsGateway.emitToUser(alert.receiverId, WS_EVENT_STATUS, payload);
  }
}
