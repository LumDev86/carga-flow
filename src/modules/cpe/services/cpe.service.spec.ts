import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { CpeService } from './cpe.service';
import { CpeRecord } from '../entities/cpe-record.entity';
import { CpeAuditLog } from '../entities/cpe-audit-log.entity';
import { AfipService } from './afip.service';
import { AfipDelegationService } from './afip-delegation.service';
import { CpeMappingService } from './cpe-mapping.service';
import { Trip } from '../../trips/entities/trip.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { TripStatus } from '../../../shared/enums/trip-status.enum';
import { UserRole } from '../../../shared/enums/user-role.enum';
import { CpeStatus } from '../../../shared/enums/cpe-status.enum';

describe('CpeService - Port ownership checks', () => {
  let service: CpeService;
  let tripRepo: any;
  let cpeRepo: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CpeService,
        {
          provide: getRepositoryToken(CpeRecord),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CpeAuditLog),
          useValue: {
            create: jest.fn().mockReturnValue({}),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Trip),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Vehicle),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: AfipService,
          useValue: {
            autorizarCpeAutomotor: jest.fn(),
            anularCpe: jest.fn(),
            consultarUltimoNroOrden: jest.fn(),
            consultarCpe: jest.fn(),
          },
        },
        {
          provide: AfipDelegationService,
          useValue: {
            getDelegationForUser: jest.fn(),
            verifyAndRegister: jest.fn(),
          },
        },
        {
          provide: CpeMappingService,
          useValue: {
            buildCpePayload: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CpeService>(CpeService);
    tripRepo = module.get(getRepositoryToken(Trip));
    cpeRepo = module.get(getRepositoryToken(CpeRecord));
  });

  describe('createAndAuthorizeCpe - ownership', () => {
    const baseTripData = {
      id: 'trip-1',
      requesterId: 'requester-1',
      driverId: 'driver-1',
      status: TripStatus.ACCEPTED,
      originPortId: 'port-1',
      destinationPortId: 'port-2',
      requester: { id: 'requester-1', cuit: '20-12345678-9' },
      driver: { id: 'driver-1', cuit: '20-87654321-0' },
    };

    it('should allow the requester', async () => {
      tripRepo.findOne.mockResolvedValue(baseTripData);
      cpeRepo.findOne.mockResolvedValue(null);

      // Will fail later (delegation check), but ownership check should pass
      try {
        await service.createAndAuthorizeCpe('trip-1', 'requester-1', {});
      } catch (e: any) {
        expect(e).not.toBeInstanceOf(ForbiddenException);
      }
    });

    it('should allow a port user associated with the trip origin', async () => {
      tripRepo.findOne.mockResolvedValue(baseTripData);
      cpeRepo.findOne.mockResolvedValue(null);

      try {
        await service.createAndAuthorizeCpe('trip-1', 'port-user-1', {}, UserRole.PUERTO, 'port-1');
      } catch (e: any) {
        // Should not be ForbiddenException - ownership check passed
        expect(e).not.toBeInstanceOf(ForbiddenException);
      }
    });

    it('should allow a port user associated with the trip destination', async () => {
      tripRepo.findOne.mockResolvedValue(baseTripData);
      cpeRepo.findOne.mockResolvedValue(null);

      try {
        await service.createAndAuthorizeCpe('trip-1', 'port-user-2', {}, UserRole.PUERTO, 'port-2');
      } catch (e: any) {
        expect(e).not.toBeInstanceOf(ForbiddenException);
      }
    });

    it('should reject a port user NOT associated with the trip', async () => {
      tripRepo.findOne.mockResolvedValue(baseTripData);
      cpeRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createAndAuthorizeCpe('trip-1', 'port-user-3', {}, UserRole.PUERTO, 'port-99'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject a non-requester non-port user', async () => {
      tripRepo.findOne.mockResolvedValue(baseTripData);
      cpeRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createAndAuthorizeCpe('trip-1', 'random-user', {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('voidCpe - ownership', () => {
    const baseCpeData = {
      id: 'cpe-1',
      status: CpeStatus.AUTHORIZED,
      cpeNumber: '12345',
      cuitSolicitante: '20-12345678-9',
      trip: {
        id: 'trip-1',
        requesterId: 'requester-1',
        originPortId: 'port-1',
        destinationPortId: 'port-2',
      },
    };

    it('should allow the requester to void', async () => {
      cpeRepo.findOne.mockResolvedValue(baseCpeData);

      try {
        await service.voidCpe('cpe-1', 'requester-1', 'test reason');
      } catch (e: any) {
        expect(e).not.toBeInstanceOf(ForbiddenException);
      }
    });

    it('should allow a port user associated with the trip', async () => {
      cpeRepo.findOne.mockResolvedValue(baseCpeData);

      try {
        await service.voidCpe('cpe-1', 'port-user-1', 'test reason', UserRole.PUERTO, 'port-1');
      } catch (e: any) {
        expect(e).not.toBeInstanceOf(ForbiddenException);
      }
    });

    it('should reject an unrelated port user', async () => {
      cpeRepo.findOne.mockResolvedValue(baseCpeData);

      await expect(
        service.voidCpe('cpe-1', 'port-user-99', 'test reason', UserRole.PUERTO, 'port-99'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject an unrelated user', async () => {
      cpeRepo.findOne.mockResolvedValue(baseCpeData);

      await expect(
        service.voidCpe('cpe-1', 'random-user', 'test reason'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
