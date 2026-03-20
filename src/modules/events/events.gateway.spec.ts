import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { EventsGateway } from './events.gateway';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../../shared/enums/user-role.enum';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let userRepo: any;

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    userRepo = module.get(getRepositoryToken(User));
    (gateway as any).server = mockServer;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('emitToPort', () => {
    it('should emit event to port room', () => {
      const portId = 'port-123';
      const data = { tripId: 'trip-1', status: 'DELIVERED' };

      gateway.emitToPort(portId, 'trip:delivered', data);

      expect(mockServer.to).toHaveBeenCalledWith('port:port-123');
      expect(mockServer.emit).toHaveBeenCalledWith('trip:delivered', data);
    });
  });

  describe('emitToUser', () => {
    it('should emit event to user room', () => {
      gateway.emitToUser('user-1', 'test:event', { foo: 'bar' });
      expect(mockServer.to).toHaveBeenCalledWith('user:user-1');
      expect(mockServer.emit).toHaveBeenCalledWith('test:event', { foo: 'bar' });
    });
  });

  describe('emitTripUpdate', () => {
    it('should emit event to trip room', () => {
      gateway.emitTripUpdate('trip-1', 'trip:updated', { status: 'IN_TRANSIT' });
      expect(mockServer.to).toHaveBeenCalledWith('trip:trip-1');
    });
  });

  describe('handleConnection', () => {
    it('should join port room for PUERTO users', async () => {
      const jwtService = gateway['jwtService'] as any;
      jwtService.verify.mockReturnValue({ sub: 'user-1', rol: 'PUERTO' });
      userRepo.findOne.mockResolvedValue({ id: 'user-1', portId: 'port-123' });

      const mockClient = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-token' }, headers: {} },
        join: jest.fn(),
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(mockClient as any);

      expect(mockClient.join).toHaveBeenCalledWith('user:user-1');
      expect(mockClient.join).toHaveBeenCalledWith('port:port-123');
      expect((mockClient as any).portId).toBe('port-123');
    });

    it('should join drivers room for CHOFER users', async () => {
      const jwtService = gateway['jwtService'] as any;
      jwtService.verify.mockReturnValue({ sub: 'driver-1', rol: 'CHOFER' });

      const mockClient = {
        id: 'socket-2',
        handshake: { auth: { token: 'valid-token' }, headers: {} },
        join: jest.fn(),
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(mockClient as any);

      expect(mockClient.join).toHaveBeenCalledWith('user:driver-1');
      expect(mockClient.join).toHaveBeenCalledWith('drivers');
    });

    it('should disconnect client without token', async () => {
      const mockClient = {
        id: 'socket-3',
        handshake: { auth: {}, headers: {} },
        join: jest.fn(),
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(mockClient as any);
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should disconnect client with invalid token', async () => {
      const jwtService = gateway['jwtService'] as any;
      jwtService.verify.mockImplementation(() => { throw new Error('Invalid token'); });

      const mockClient = {
        id: 'socket-4',
        handshake: { auth: { token: 'bad-token' }, headers: {} },
        join: jest.fn(),
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(mockClient as any);
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should not join port room if PUERTO user has no portId', async () => {
      const jwtService = gateway['jwtService'] as any;
      jwtService.verify.mockReturnValue({ sub: 'user-2', rol: 'PUERTO' });
      userRepo.findOne.mockResolvedValue({ id: 'user-2', portId: null });

      const mockClient = {
        id: 'socket-5',
        handshake: { auth: { token: 'valid-token' }, headers: {} },
        join: jest.fn(),
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(mockClient as any);

      expect(mockClient.join).toHaveBeenCalledWith('user:user-2');
      expect(mockClient.join).not.toHaveBeenCalledWith(expect.stringContaining('port:'));
    });
  });
});
