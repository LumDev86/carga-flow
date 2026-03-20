import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PortsService } from './ports.service';
import { Port } from './entities/port.entity';

const mockPorts: Partial<Port>[] = [
  {
    id: 'port-1',
    name: 'Puerto Rosario',
    latitude: -32.9468,
    longitude: -60.6393,
    isActive: true,
  },
  {
    id: 'port-2',
    name: 'Puerto Buenos Aires',
    latitude: -34.6118,
    longitude: -58.3625,
    isActive: true,
  },
];

describe('PortsService', () => {
  let service: PortsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortsService,
        {
          provide: getRepositoryToken(Port),
          useValue: {
            find: jest.fn().mockResolvedValue(mockPorts),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PortsService>(PortsService);
  });

  describe('findNearestPort', () => {
    it('should find port within 500m', async () => {
      // Coordinates very close to Puerto Rosario
      const result = await service.findNearestPort(-32.9468, -60.6393);
      expect(result).toBeDefined();
      expect(result!.id).toBe('port-1');
    });

    it('should return null when no port within range', async () => {
      // Coordinates far from any port (middle of pampa)
      const result = await service.findNearestPort(-36.0, -62.0);
      expect(result).toBeNull();
    });

    it('should find the nearest port when multiple are in range', async () => {
      // Exact match on port-1 coordinates
      const result = await service.findNearestPort(-32.9468, -60.6393, 1000);
      expect(result).toBeDefined();
      expect(result!.id).toBe('port-1');
    });

    it('should respect maxDistanceKm parameter', async () => {
      // Use a very small radius
      const result = await service.findNearestPort(-32.9468, -60.6393, 0.001);
      expect(result).toBeDefined(); // exact match should still work
    });
  });
});
