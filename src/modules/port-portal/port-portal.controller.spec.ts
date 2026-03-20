import { Test, TestingModule } from '@nestjs/testing';
import { PortPortalController } from './port-portal.controller';
import { PortPortalService } from './port-portal.service';
import { TripsService } from '../trips/trips.service';
import { StorageService } from '../../common/storage/storage.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../shared/enums/user-role.enum';
import { TripStatus } from '../../shared/enums/trip-status.enum';
import { TripDirection } from './dto/port-trip-filters.dto';

const PORT_ID = 'port-uuid-1';
const USER_ID = 'user-uuid-1';
const TRIP_ID = 'trip-uuid-1';

const mockPortPortalService = {
  getMyPort: jest.fn().mockResolvedValue({ id: PORT_ID, name: 'Puerto Rosario' }),
  updateMyPort: jest.fn().mockResolvedValue({ id: PORT_ID, notes: 'updated' }),
  getDashboard: jest.fn().mockResolvedValue({
    tripsToday: 5,
    tripsThisWeek: 20,
    tripsThisMonth: 80,
    pendingUnloads: 3,
    pendingCpes: 2,
    arrivalsToday: 3,
    departuresToday: 2,
  }),
  getPortTrips: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
  getTodayTrips: jest.fn().mockResolvedValue({ arrivals: [], departures: [] }),
  getTripDetail: jest.fn().mockResolvedValue({ id: TRIP_ID }),
  getTripTimeline: jest.fn().mockResolvedValue([]),
  confirmUnload: jest.fn().mockResolvedValue({ id: TRIP_ID }),
  getTripDocuments: jest.fn().mockResolvedValue([]),
  getTripCpe: jest.fn().mockResolvedValue(null),
  getCpePdf: jest.fn().mockResolvedValue({ pdfUrl: null }),
  getTripIncidents: jest.fn().mockResolvedValue([]),
  getPortStats: jest.fn().mockResolvedValue({}),
};

const mockTripsService = {
  addTripDocument: jest.fn(),
  confirmUnload: jest.fn(),
};

const mockStorageService = {
  uploadFile: jest.fn().mockResolvedValue('https://storage.example.com/file.pdf'),
};

describe('PortPortalController', () => {
  let controller: PortPortalController;
  let service: typeof mockPortPortalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PortPortalController],
      providers: [
        { provide: PortPortalService, useValue: mockPortPortalService },
        { provide: TripsService, useValue: mockTripsService },
        { provide: StorageService, useValue: mockStorageService },
        Reflector,
      ],
    }).compile();

    controller = module.get<PortPortalController>(PortPortalController);
    service = mockPortPortalService;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // --- RolesGuard verification ---

  describe('Role guards', () => {
    it('should have RolesGuard applied at controller level', () => {
      const guards = Reflect.getMetadata('__guards__', PortPortalController);
      expect(guards).toBeDefined();
      expect(guards).toContain(RolesGuard);
    });

    it('should require PUERTO role at controller level', () => {
      const roles = Reflect.getMetadata('roles', PortPortalController);
      expect(roles).toBeDefined();
      expect(roles).toContain(UserRole.PUERTO);
    });
  });

  // --- Endpoint tests ---

  describe('GET /port-portal/me', () => {
    it('should call getMyPort with portId', async () => {
      await controller.getMyPort(PORT_ID);
      expect(service.getMyPort).toHaveBeenCalledWith(PORT_ID);
    });
  });

  describe('PATCH /port-portal/me', () => {
    it('should call updateMyPort', async () => {
      await controller.updateMyPort(PORT_ID, { notes: 'test' });
      expect(service.updateMyPort).toHaveBeenCalledWith(PORT_ID, { notes: 'test' });
    });
  });

  describe('GET /port-portal/dashboard', () => {
    it('should return dashboard KPIs', async () => {
      const result = await controller.getDashboard(PORT_ID);
      expect(result.tripsToday).toBe(5);
      expect(service.getDashboard).toHaveBeenCalledWith(PORT_ID);
    });
  });

  describe('GET /port-portal/trips', () => {
    it('should call getPortTrips with filters', async () => {
      const filters = { status: TripStatus.DELIVERED, direction: TripDirection.INCOMING, page: 2, limit: 10 };
      await controller.getTrips(PORT_ID, filters);
      expect(service.getPortTrips).toHaveBeenCalledWith(PORT_ID, filters);
    });
  });

  describe('GET /port-portal/trips/today', () => {
    it('should return today trips', async () => {
      const result = await controller.getTodayTrips(PORT_ID);
      expect(result).toHaveProperty('arrivals');
      expect(result).toHaveProperty('departures');
    });
  });

  describe('GET /port-portal/trips/:id', () => {
    it('should call getTripDetail', async () => {
      await controller.getTripDetail(PORT_ID, TRIP_ID);
      expect(service.getTripDetail).toHaveBeenCalledWith(PORT_ID, TRIP_ID);
    });
  });

  describe('GET /port-portal/trips/:id/timeline', () => {
    it('should call getTripTimeline', async () => {
      await controller.getTripTimeline(PORT_ID, TRIP_ID);
      expect(service.getTripTimeline).toHaveBeenCalledWith(PORT_ID, TRIP_ID);
    });
  });

  describe('PATCH /port-portal/trips/:id/confirm-unload', () => {
    it('should call confirmUnload with user data', async () => {
      const user = { id: USER_ID, portId: PORT_ID };
      await controller.confirmUnload(user, TRIP_ID);
      expect(service.confirmUnload).toHaveBeenCalledWith(PORT_ID, USER_ID, TRIP_ID);
    });
  });

  describe('GET /port-portal/trips/:id/documents', () => {
    it('should call getTripDocuments', async () => {
      await controller.getTripDocuments(PORT_ID, TRIP_ID);
      expect(service.getTripDocuments).toHaveBeenCalledWith(PORT_ID, TRIP_ID);
    });
  });

  describe('GET /port-portal/trips/:id/cpe', () => {
    it('should call getTripCpe', async () => {
      await controller.getTripCpe(PORT_ID, TRIP_ID);
      expect(service.getTripCpe).toHaveBeenCalledWith(PORT_ID, TRIP_ID);
    });
  });

  describe('GET /port-portal/cpe/:id/pdf', () => {
    it('should call getCpePdf', async () => {
      await controller.getCpePdf('cpe-id');
      expect(service.getCpePdf).toHaveBeenCalledWith('cpe-id');
    });
  });

  describe('GET /port-portal/trips/:id/incidents', () => {
    it('should call getTripIncidents', async () => {
      await controller.getTripIncidents(PORT_ID, TRIP_ID);
      expect(service.getTripIncidents).toHaveBeenCalledWith(PORT_ID, TRIP_ID);
    });
  });

  describe('GET /port-portal/stats', () => {
    it('should call getPortStats', async () => {
      await controller.getStats(PORT_ID);
      expect(service.getPortStats).toHaveBeenCalledWith(PORT_ID);
    });
  });
});
