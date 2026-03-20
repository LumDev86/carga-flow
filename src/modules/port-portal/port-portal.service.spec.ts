import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PortPortalService } from './port-portal.service';
import { Trip } from '../trips/entities/trip.entity';
import { TripDocument } from '../trips/entities/trip-document.entity';
import { TripIncident } from '../trips/entities/trip-incident.entity';
import { User } from '../users/entities/user.entity';
import { Port } from '../ports/entities/port.entity';
import { CpeRecord } from '../cpe/entities/cpe-record.entity';
import { TripsService } from '../trips/trips.service';
import { EventsGateway } from '../events/events.gateway';
import { TripStatus } from '../../shared/enums/trip-status.enum';
import { TripDirection } from './dto/port-trip-filters.dto';
import { CargoType } from '../../shared/enums/cargo-type.enum';

// Mock data
const PORT_ID = 'port-uuid-1';
const OTHER_PORT_ID = 'port-uuid-2';
const USER_ID = 'user-uuid-1';
const TRIP_ID = 'trip-uuid-1';

const mockPort: Partial<Port> = {
  id: PORT_ID,
  name: 'Puerto Rosario',
  address: 'Av. Belgrano 100',
  latitude: -32.9468,
  longitude: -60.6393,
  city: 'Rosario',
  state: 'Santa Fe',
  portType: 'DESCARGA',
  isActive: true,
  notes: null as any,
};

const mockTrip: Partial<Trip> = {
  id: TRIP_ID,
  requesterId: 'requester-uuid',
  driverId: 'driver-uuid',
  status: TripStatus.DELIVERED,
  originPortId: PORT_ID,
  destinationPortId: PORT_ID,
  originAddress: 'Campo Lote 5',
  destinationAddress: 'Puerto Rosario',
  cargoDescription: 'Soja',
  cargoType: CargoType.GRANOS_DERIVADOS,
  createdAt: new Date(),
  acceptedAt: new Date(),
  pickedUpAt: new Date(),
  deliveredAt: new Date(),
  unloadConfirmedAt: null,
  unloadConfirmedById: null,
  cancelledAt: null,
  requester: { id: 'requester-uuid', firstName: 'Juan', lastName: 'Perez' } as User,
  driver: { id: 'driver-uuid', firstName: 'Carlos', lastName: 'Lopez' } as User,
};

// Helper to create mock QueryBuilder
function createMockQueryBuilder(result: any = [], count: number = 0) {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(count),
    getMany: jest.fn().mockResolvedValue(result),
    getManyAndCount: jest.fn().mockResolvedValue([result, count]),
    getRawMany: jest.fn().mockResolvedValue(result),
    getRawOne: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

describe('PortPortalService', () => {
  let service: PortPortalService;
  let tripRepo: jest.Mocked<Repository<Trip>>;
  let portRepo: jest.Mocked<Repository<Port>>;
  let tripDocRepo: jest.Mocked<Repository<TripDocument>>;
  let tripIncidentRepo: jest.Mocked<Repository<TripIncident>>;
  let cpeRepo: jest.Mocked<Repository<CpeRecord>>;
  let tripsService: jest.Mocked<TripsService>;
  let eventsGateway: jest.Mocked<EventsGateway>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortPortalService,
        {
          provide: getRepositoryToken(Trip),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Port),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TripDocument),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TripIncident),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CpeRecord),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: TripsService,
          useValue: {
            confirmUnload: jest.fn(),
            addTripDocument: jest.fn(),
          },
        },
        {
          provide: EventsGateway,
          useValue: {
            emitToPort: jest.fn(),
            emitToUser: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PortPortalService>(PortPortalService);
    tripRepo = module.get(getRepositoryToken(Trip));
    portRepo = module.get(getRepositoryToken(Port));
    tripDocRepo = module.get(getRepositoryToken(TripDocument));
    tripIncidentRepo = module.get(getRepositoryToken(TripIncident));
    cpeRepo = module.get(getRepositoryToken(CpeRecord));
    tripsService = module.get(TripsService) as jest.Mocked<TripsService>;
    eventsGateway = module.get(EventsGateway) as jest.Mocked<EventsGateway>;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // --- getMyPort ---

  describe('getMyPort', () => {
    it('should return port when found', async () => {
      portRepo.findOne.mockResolvedValue(mockPort as Port);
      const result = await service.getMyPort(PORT_ID);
      expect(result).toEqual(mockPort);
      expect(portRepo.findOne).toHaveBeenCalledWith({ where: { id: PORT_ID } });
    });

    it('should throw BadRequestException when portId is null/empty', async () => {
      await expect(service.getMyPort(null as any)).rejects.toThrow(BadRequestException);
      await expect(service.getMyPort('')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when port not found', async () => {
      portRepo.findOne.mockResolvedValue(null);
      await expect(service.getMyPort(PORT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // --- updateMyPort ---

  describe('updateMyPort', () => {
    it('should update port notes', async () => {
      const updated = { ...mockPort, notes: 'Horario: 8-18hs' } as Port;
      portRepo.findOne.mockResolvedValue(mockPort as Port);
      portRepo.save.mockResolvedValue(updated);

      const result = await service.updateMyPort(PORT_ID, { notes: 'Horario: 8-18hs' });
      expect(result.notes).toBe('Horario: 8-18hs');
    });
  });

  // --- getDashboard ---

  describe('getDashboard', () => {
    it('should return dashboard KPIs', async () => {
      const qb = createMockQueryBuilder([], 5);
      tripRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getDashboard(PORT_ID);

      expect(result).toHaveProperty('tripsToday');
      expect(result).toHaveProperty('tripsThisWeek');
      expect(result).toHaveProperty('tripsThisMonth');
      expect(result).toHaveProperty('pendingUnloads');
      expect(result).toHaveProperty('pendingCpes');
      expect(result).toHaveProperty('arrivalsToday');
      expect(result).toHaveProperty('departuresToday');
    });
  });

  // --- getPortTrips ---

  describe('getPortTrips', () => {
    it('should return paginated trips with default filters', async () => {
      const qb = createMockQueryBuilder([mockTrip], 1);
      tripRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getPortTrips(PORT_ID, {});
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should filter by direction incoming', async () => {
      const qb = createMockQueryBuilder([mockTrip], 1);
      tripRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getPortTrips(PORT_ID, { direction: TripDirection.INCOMING });
      expect(qb.where).toHaveBeenCalledWith('trip.destination_port_id = :portId', { portId: PORT_ID });
    });

    it('should filter by direction outgoing', async () => {
      const qb = createMockQueryBuilder([mockTrip], 1);
      tripRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getPortTrips(PORT_ID, { direction: TripDirection.OUTGOING });
      expect(qb.where).toHaveBeenCalledWith('trip.origin_port_id = :portId', { portId: PORT_ID });
    });

    it('should filter by status', async () => {
      const qb = createMockQueryBuilder([], 0);
      tripRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getPortTrips(PORT_ID, { status: TripStatus.DELIVERED });
      expect(qb.andWhere).toHaveBeenCalledWith('trip.status = :status', { status: TripStatus.DELIVERED });
    });

    it('should filter by cargo type', async () => {
      const qb = createMockQueryBuilder([], 0);
      tripRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getPortTrips(PORT_ID, { cargoType: CargoType.GRANOS_DERIVADOS });
      expect(qb.andWhere).toHaveBeenCalledWith('trip.cargo_type = :cargoType', { cargoType: CargoType.GRANOS_DERIVADOS });
    });

    it('should apply search filter', async () => {
      const qb = createMockQueryBuilder([], 0);
      tripRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getPortTrips(PORT_ID, { search: 'soja' });
      // andWhere is called with Brackets for search
      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('should apply date range filters', async () => {
      const qb = createMockQueryBuilder([], 0);
      tripRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getPortTrips(PORT_ID, {
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('trip.created_at >= :dateFrom', { dateFrom: '2026-01-01' });
      expect(qb.andWhere).toHaveBeenCalledWith('trip.created_at <= :dateTo', { dateTo: '2026-12-31' });
    });

    it('should paginate correctly', async () => {
      const qb = createMockQueryBuilder([], 50);
      tripRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getPortTrips(PORT_ID, { page: 3, limit: 10 });
      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result.totalPages).toBe(5);
    });
  });

  // --- getTodayTrips ---

  describe('getTodayTrips', () => {
    it('should return arrivals and departures', async () => {
      const qb = createMockQueryBuilder([mockTrip]);
      tripRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getTodayTrips(PORT_ID);
      expect(result).toHaveProperty('arrivals');
      expect(result).toHaveProperty('departures');
    });
  });

  // --- getTripDetail ---

  describe('getTripDetail', () => {
    it('should return trip when it belongs to port', async () => {
      tripRepo.findOne.mockResolvedValue(mockTrip as Trip);
      const result = await service.getTripDetail(PORT_ID, TRIP_ID);
      expect(result.id).toBe(TRIP_ID);
    });

    it('should throw NotFoundException when trip not found', async () => {
      tripRepo.findOne.mockResolvedValue(null);
      await expect(service.getTripDetail(PORT_ID, TRIP_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when trip does not belong to port', async () => {
      const unrelatedTrip = { ...mockTrip, originPortId: OTHER_PORT_ID, destinationPortId: OTHER_PORT_ID } as Trip;
      tripRepo.findOne.mockResolvedValue(unrelatedTrip);
      await expect(service.getTripDetail(PORT_ID, TRIP_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should allow access when port is origin', async () => {
      const trip = { ...mockTrip, originPortId: PORT_ID, destinationPortId: OTHER_PORT_ID } as Trip;
      tripRepo.findOne.mockResolvedValue(trip);
      const result = await service.getTripDetail(PORT_ID, TRIP_ID);
      expect(result.id).toBe(TRIP_ID);
    });

    it('should allow access when port is destination', async () => {
      const trip = { ...mockTrip, originPortId: OTHER_PORT_ID, destinationPortId: PORT_ID } as Trip;
      tripRepo.findOne.mockResolvedValue(trip);
      const result = await service.getTripDetail(PORT_ID, TRIP_ID);
      expect(result.id).toBe(TRIP_ID);
    });
  });

  // --- getTripTimeline ---

  describe('getTripTimeline', () => {
    it('should build timeline with all events', async () => {
      tripRepo.findOne.mockResolvedValue(mockTrip as Trip);
      tripIncidentRepo.find.mockResolvedValue([]);

      const timeline = await service.getTripTimeline(PORT_ID, TRIP_ID);

      expect(timeline.length).toBeGreaterThanOrEqual(4); // created, accepted, picked_up, delivered
      expect(timeline[0].event).toBe('created');
      expect(timeline[timeline.length - 1].event).toBe('delivered');
    });

    it('should include incidents in timeline', async () => {
      tripRepo.findOne.mockResolvedValue(mockTrip as Trip);
      tripIncidentRepo.find.mockResolvedValue([
        {
          tripId: TRIP_ID,
          type: 'DELAY',
          description: 'Demora en ruta',
          createdAt: new Date(),
        } as any,
      ]);

      const timeline = await service.getTripTimeline(PORT_ID, TRIP_ID);
      const incidents = timeline.filter((e) => e.event === 'incident');
      expect(incidents).toHaveLength(1);
    });

    it('should sort timeline chronologically', async () => {
      tripRepo.findOne.mockResolvedValue(mockTrip as Trip);
      tripIncidentRepo.find.mockResolvedValue([]);

      const timeline = await service.getTripTimeline(PORT_ID, TRIP_ID);
      for (let i = 1; i < timeline.length; i++) {
        expect(new Date(timeline[i].timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(timeline[i - 1].timestamp).getTime(),
        );
      }
    });
  });

  // --- confirmUnload ---

  describe('confirmUnload', () => {
    it('should confirm unload when port is destination', async () => {
      const trip = { ...mockTrip, destinationPortId: PORT_ID } as Trip;
      tripRepo.findOne.mockResolvedValue(trip);
      tripsService.confirmUnload.mockResolvedValue(trip);

      await service.confirmUnload(PORT_ID, USER_ID, TRIP_ID);
      expect(tripsService.confirmUnload).toHaveBeenCalledWith(TRIP_ID, USER_ID, PORT_ID);
    });

    it('should throw ForbiddenException when port is not destination', async () => {
      const trip = { ...mockTrip, originPortId: PORT_ID, destinationPortId: OTHER_PORT_ID } as Trip;
      tripRepo.findOne.mockResolvedValue(trip);

      await expect(service.confirmUnload(PORT_ID, USER_ID, TRIP_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when trip not related to port', async () => {
      const trip = { ...mockTrip, originPortId: OTHER_PORT_ID, destinationPortId: OTHER_PORT_ID } as Trip;
      tripRepo.findOne.mockResolvedValue(trip);

      await expect(service.confirmUnload(PORT_ID, USER_ID, TRIP_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // --- getTripDocuments ---

  describe('getTripDocuments', () => {
    it('should return documents for valid trip', async () => {
      tripRepo.findOne.mockResolvedValue(mockTrip as Trip);
      const docs = [{ id: 'doc-1', tripId: TRIP_ID, type: 'REMITO' }];
      tripDocRepo.find.mockResolvedValue(docs as any);

      const result = await service.getTripDocuments(PORT_ID, TRIP_ID);
      expect(result).toEqual(docs);
    });

    it('should throw when trip does not belong to port', async () => {
      const trip = { ...mockTrip, originPortId: OTHER_PORT_ID, destinationPortId: OTHER_PORT_ID } as Trip;
      tripRepo.findOne.mockResolvedValue(trip);

      await expect(service.getTripDocuments(PORT_ID, TRIP_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // --- getTripCpe ---

  describe('getTripCpe', () => {
    it('should return CPE for valid trip', async () => {
      tripRepo.findOne.mockResolvedValue(mockTrip as Trip);
      const cpe = { id: 'cpe-1', tripId: TRIP_ID, status: 'AUTHORIZED' };
      cpeRepo.findOne.mockResolvedValue(cpe as any);

      const result = await service.getTripCpe(PORT_ID, TRIP_ID);
      expect(result).toEqual(cpe);
    });

    it('should return null when no CPE exists', async () => {
      tripRepo.findOne.mockResolvedValue(mockTrip as Trip);
      cpeRepo.findOne.mockResolvedValue(null);

      const result = await service.getTripCpe(PORT_ID, TRIP_ID);
      expect(result).toBeNull();
    });
  });

  // --- getCpePdf ---

  describe('getCpePdf', () => {
    it('should return pdf URL', async () => {
      cpeRepo.findOne.mockResolvedValue({ id: 'cpe-1', pdfUrl: 'https://example.com/cpe.pdf' } as any);
      const result = await service.getCpePdf('cpe-1');
      expect(result.pdfUrl).toBe('https://example.com/cpe.pdf');
    });

    it('should throw NotFoundException when CPE not found', async () => {
      cpeRepo.findOne.mockResolvedValue(null);
      await expect(service.getCpePdf('cpe-1')).rejects.toThrow(NotFoundException);
    });
  });

  // --- getTripIncidents ---

  describe('getTripIncidents', () => {
    it('should return incidents for valid trip', async () => {
      tripRepo.findOne.mockResolvedValue(mockTrip as Trip);
      const incidents = [{ id: 'inc-1', tripId: TRIP_ID, type: 'DELAY' }];
      tripIncidentRepo.find.mockResolvedValue(incidents as any);

      const result = await service.getTripIncidents(PORT_ID, TRIP_ID);
      expect(result).toEqual(incidents);
    });
  });

  // --- getPortStats ---

  describe('getPortStats', () => {
    it('should return stats with all fields', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getRawOne.mockResolvedValue({ avg: 4.5, avgHours: 3.2 });
      qb.getRawMany.mockResolvedValue([]);
      tripRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getPortStats(PORT_ID);

      expect(result).toHaveProperty('tripsByMonth');
      expect(result).toHaveProperty('averageRatingGiven');
      expect(result).toHaveProperty('topDrivers');
      expect(result).toHaveProperty('cargoTypeBreakdown');
      expect(result).toHaveProperty('avgDeliveryTimeHours');
    });

    it('should handle no data gracefully', async () => {
      const qb = createMockQueryBuilder([]);
      qb.getRawOne.mockResolvedValue({ avg: null, avgHours: null });
      qb.getRawMany.mockResolvedValue([]);
      tripRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getPortStats(PORT_ID);

      expect(result.averageRatingGiven).toBe(0);
      expect(result.avgDeliveryTimeHours).toBe(0);
      expect(result.tripsByMonth).toEqual([]);
      expect(result.topDrivers).toEqual([]);
      expect(result.cargoTypeBreakdown).toEqual([]);
    });
  });
});
