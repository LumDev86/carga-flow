import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TripAlertsService } from './trip-alerts.service';
import { TripAlert } from './entities/trip-alert.entity';
import { Trip } from '../trips/entities/trip.entity';
import { Port } from '../ports/entities/port.entity';
import { NotificationService } from '../notifications/notification.service';
import { PushNotificationService } from '../notifications/push-notification.service';
import { EventsGateway } from '../events/events.gateway';
import {
  TripAlertType,
  TripAlertPriority,
  TripAlertStatus,
} from '../../shared/enums/trip-alert.enum';
import { UserRole } from '../../shared/enums/user-role.enum';

const PORT_ID = 'port-uuid-1';
const OTHER_PORT_ID = 'port-uuid-2';
const PORT_USER_ID = 'port-user-uuid';
const REQUESTER_ID = 'requester-uuid';
const OTHER_USER_ID = 'other-user-uuid';
const TRIP_ID = 'trip-uuid';
const ALERT_ID = 'alert-uuid';

const mockTrip: Partial<Trip> = {
  id: TRIP_ID,
  requesterId: REQUESTER_ID,
  originPortId: PORT_ID,
  destinationPortId: null as any,
};

const mockPort: Partial<Port> = {
  id: PORT_ID,
  name: 'Puerto Rosario',
};

function buildAlert(overrides: Partial<TripAlert> = {}): TripAlert {
  return {
    id: ALERT_ID,
    tripId: TRIP_ID,
    portId: PORT_ID,
    sentByUserId: PORT_USER_ID,
    receiverId: REQUESTER_ID,
    type: TripAlertType.DEMORA_DESCARGA,
    priority: TripAlertPriority.NORMAL,
    message: null,
    status: TripAlertStatus.SENT,
    sentAt: new Date(),
    deliveredAt: null,
    readAt: null,
    acknowledgedAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TripAlert;
}

describe('TripAlertsService', () => {
  let service: TripAlertsService;
  let alertRepo: jest.Mocked<Repository<TripAlert>>;
  let tripRepo: jest.Mocked<Repository<Trip>>;
  let portRepo: jest.Mocked<Repository<Port>>;
  let notificationService: jest.Mocked<NotificationService>;
  let pushService: jest.Mocked<PushNotificationService>;
  let eventsGateway: jest.Mocked<EventsGateway>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripAlertsService,
        {
          provide: getRepositoryToken(TripAlert),
          useValue: {
            create: jest.fn((data) => data),
            save: jest.fn(),
            findOne: jest.fn(),
            findOneOrFail: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Trip),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Port),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: NotificationService,
          useValue: { create: jest.fn() },
        },
        {
          provide: PushNotificationService,
          useValue: { sendToUser: jest.fn() },
        },
        {
          provide: EventsGateway,
          useValue: {
            emitToUser: jest.fn(),
            emitToPort: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(TripAlertsService);
    alertRepo = module.get(getRepositoryToken(TripAlert));
    tripRepo = module.get(getRepositoryToken(Trip));
    portRepo = module.get(getRepositoryToken(Port));
    notificationService = module.get(NotificationService);
    pushService = module.get(PushNotificationService);
    eventsGateway = module.get(EventsGateway);
  });

  describe('createAlert', () => {
    it('rechaza si el usuario no tiene puerto asociado', async () => {
      await expect(
        service.createAlert(PORT_USER_ID, '', {
          tripId: TRIP_ID,
          type: TripAlertType.DEMORA_DESCARGA,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si el trip no existe', async () => {
      tripRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createAlert(PORT_USER_ID, PORT_ID, {
          tripId: TRIP_ID,
          type: TripAlertType.DEMORA_DESCARGA,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza si el trip no pertenece al puerto del usuario', async () => {
      tripRepo.findOne.mockResolvedValue({
        ...mockTrip,
        originPortId: OTHER_PORT_ID,
        destinationPortId: null,
      } as Trip);
      await expect(
        service.createAlert(PORT_USER_ID, PORT_ID, {
          tripId: TRIP_ID,
          type: TripAlertType.DEMORA_DESCARGA,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza si el trip no tiene dador (requesterId)', async () => {
      tripRepo.findOne.mockResolvedValue({
        ...mockTrip,
        requesterId: null,
      } as any);
      await expect(
        service.createAlert(PORT_USER_ID, PORT_ID, {
          tripId: TRIP_ID,
          type: TripAlertType.DEMORA_DESCARGA,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea alerta, persiste, dispara notification + push + WS', async () => {
      tripRepo.findOne.mockResolvedValue(mockTrip as Trip);
      portRepo.findOne.mockResolvedValue(mockPort as Port);
      const saved = buildAlert({ priority: TripAlertPriority.URGENTE });
      alertRepo.save.mockResolvedValue(saved);
      alertRepo.findOneOrFail.mockResolvedValue(saved);

      const result = await service.createAlert(PORT_USER_ID, PORT_ID, {
        tripId: TRIP_ID,
        type: TripAlertType.DEMORA_DESCARGA,
        priority: TripAlertPriority.URGENTE,
        message: 'Llegá antes de las 16hs',
      });

      expect(alertRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId: TRIP_ID,
          portId: PORT_ID,
          sentByUserId: PORT_USER_ID,
          receiverId: REQUESTER_ID,
          type: TripAlertType.DEMORA_DESCARGA,
          priority: TripAlertPriority.URGENTE,
          message: 'Llegá antes de las 16hs',
          status: TripAlertStatus.SENT,
        }),
      );
      expect(alertRepo.save).toHaveBeenCalled();
      expect(notificationService.create).toHaveBeenCalledWith(
        REQUESTER_ID,
        'trip-alert:new',
        expect.stringMatching(/urgente/i),
        expect.stringContaining('Demora en la descarga'),
        expect.objectContaining({ screen: 'PORT_ALERT' }),
      );
      expect(pushService.sendToUser).toHaveBeenCalledWith(
        REQUESTER_ID,
        expect.objectContaining({
          data: expect.objectContaining({ type: 'PORT_ALERT' }),
        }),
      );
      expect(eventsGateway.emitToUser).toHaveBeenCalledWith(
        REQUESTER_ID,
        'trip-alert:new',
        expect.objectContaining({ alertId: ALERT_ID }),
      );
      // El eco al puerto propio también debe ser 'trip-alert:new', no 'status-changed'
      expect(eventsGateway.emitToPort).toHaveBeenCalledWith(
        PORT_ID,
        'trip-alert:new',
        expect.objectContaining({ alertId: ALERT_ID }),
      );
      expect(result).toBe(saved);
    });

    it('acepta trip donde el puerto es destino (no solo origen)', async () => {
      tripRepo.findOne.mockResolvedValue({
        ...mockTrip,
        originPortId: OTHER_PORT_ID,
        destinationPortId: PORT_ID,
      } as Trip);
      portRepo.findOne.mockResolvedValue(mockPort as Port);
      const saved = buildAlert();
      alertRepo.save.mockResolvedValue(saved);
      alertRepo.findOneOrFail.mockResolvedValue(saved);

      await expect(
        service.createAlert(PORT_USER_ID, PORT_ID, {
          tripId: TRIP_ID,
          type: TripAlertType.PROBLEMA_CARGA,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('getAlertsByTrip', () => {
    it('rechaza si el solicitante no es el requester del trip', async () => {
      tripRepo.findOne.mockResolvedValue(mockTrip as Trip);
      await expect(
        service.getAlertsByTrip(
          TRIP_ID,
          OTHER_USER_ID,
          UserRole.SOLICITANTE,
          null,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza si el puerto no pertenece al trip', async () => {
      tripRepo.findOne.mockResolvedValue(mockTrip as Trip);
      await expect(
        service.getAlertsByTrip(
          TRIP_ID,
          OTHER_USER_ID,
          UserRole.PUERTO,
          OTHER_PORT_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permite al requester listar sus alertas', async () => {
      tripRepo.findOne.mockResolvedValue(mockTrip as Trip);
      alertRepo.find.mockResolvedValue([buildAlert()]);
      const result = await service.getAlertsByTrip(
        TRIP_ID,
        REQUESTER_ID,
        UserRole.SOLICITANTE,
        null,
      );
      expect(result).toHaveLength(1);
    });

    it('permite al puerto asociado listar alertas', async () => {
      tripRepo.findOne.mockResolvedValue(mockTrip as Trip);
      alertRepo.find.mockResolvedValue([buildAlert()]);
      const result = await service.getAlertsByTrip(
        TRIP_ID,
        PORT_USER_ID,
        UserRole.PUERTO,
        PORT_ID,
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('markAsRead', () => {
    it('rechaza si el usuario no es el receiver', async () => {
      alertRepo.findOne.mockResolvedValue(buildAlert());
      await expect(
        service.markAsRead(ALERT_ID, OTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza si la alerta fue cancelada', async () => {
      alertRepo.findOne.mockResolvedValue(
        buildAlert({ status: TripAlertStatus.CANCELLED }),
      );
      await expect(
        service.markAsRead(ALERT_ID, REQUESTER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('actualiza a READ y emite WS al puerto y al dador', async () => {
      const alert = buildAlert();
      alertRepo.findOne.mockResolvedValue(alert);
      alertRepo.save.mockImplementation(async (a: any) => a);

      const result = await service.markAsRead(ALERT_ID, REQUESTER_ID);

      expect(result.status).toBe(TripAlertStatus.READ);
      expect(result.readAt).toBeInstanceOf(Date);
      expect(eventsGateway.emitToPort).toHaveBeenCalledWith(
        PORT_ID,
        'trip-alert:status-changed',
        expect.objectContaining({ status: TripAlertStatus.READ }),
      );
      expect(eventsGateway.emitToUser).toHaveBeenCalledWith(
        REQUESTER_ID,
        'trip-alert:status-changed',
        expect.anything(),
      );
    });

    it('es idempotente si ya está ACKNOWLEDGED', async () => {
      const alert = buildAlert({
        status: TripAlertStatus.ACKNOWLEDGED,
        readAt: new Date(),
        acknowledgedAt: new Date(),
      });
      alertRepo.findOne.mockResolvedValue(alert);
      const result = await service.markAsRead(ALERT_ID, REQUESTER_ID);
      expect(result.status).toBe(TripAlertStatus.ACKNOWLEDGED);
      expect(alertRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('acknowledge', () => {
    it('actualiza a ACKNOWLEDGED y emite WS', async () => {
      alertRepo.findOne.mockResolvedValue(buildAlert());
      alertRepo.save.mockImplementation(async (a: any) => a);
      const result = await service.acknowledge(ALERT_ID, REQUESTER_ID);
      expect(result.status).toBe(TripAlertStatus.ACKNOWLEDGED);
      expect(result.acknowledgedAt).toBeInstanceOf(Date);
      expect(result.readAt).toBeInstanceOf(Date);
      expect(eventsGateway.emitToPort).toHaveBeenCalled();
    });

    it('rechaza si la alerta fue cancelada', async () => {
      alertRepo.findOne.mockResolvedValue(
        buildAlert({ status: TripAlertStatus.CANCELLED }),
      );
      await expect(
        service.acknowledge(ALERT_ID, REQUESTER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('rechaza si el usuario no es quien envió la alerta', async () => {
      alertRepo.findOne.mockResolvedValue(buildAlert());
      await expect(
        service.cancel(ALERT_ID, OTHER_USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza si la alerta ya fue leída', async () => {
      alertRepo.findOne.mockResolvedValue(
        buildAlert({ status: TripAlertStatus.READ, readAt: new Date() }),
      );
      await expect(
        service.cancel(ALERT_ID, PORT_USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('cancela alerta SENT con reason y emite WS', async () => {
      alertRepo.findOne.mockResolvedValue(buildAlert());
      alertRepo.save.mockImplementation(async (a: any) => a);
      const result = await service.cancel(
        ALERT_ID,
        PORT_USER_ID,
        'Falsa alarma',
      );
      expect(result.status).toBe(TripAlertStatus.CANCELLED);
      expect(result.cancelledAt).toBeInstanceOf(Date);
      expect(result.cancelReason).toBe('Falsa alarma');
      expect(eventsGateway.emitToUser).toHaveBeenCalledWith(
        REQUESTER_ID,
        'trip-alert:status-changed',
        expect.objectContaining({ status: TripAlertStatus.CANCELLED }),
      );
    });
  });
});
