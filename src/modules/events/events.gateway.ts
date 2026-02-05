import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/events',
  cors: { origin: '*' },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      const userRole = payload.rol;

      // Store user info on socket
      (client as any).userId = userId;
      (client as any).userRole = userRole;

      // Join personal room
      client.join(`user:${userId}`);

      // If driver, join drivers room
      if (userRole === 'CHOFER') {
        client.join('drivers');
      }

      this.logger.log(`Client connected: ${userId} (${userRole})`);
    } catch {
      this.logger.warn(`Client ${client.id} failed auth`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).userId;
    if (userId) {
      this.logger.log(`Client disconnected: ${userId}`);
    }
  }

  @SubscribeMessage('trip:subscribe')
  handleTripSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tripId: string },
  ) {
    client.join(`trip:${data.tripId}`);
    this.logger.log(`User ${(client as any).userId} subscribed to trip:${data.tripId}`);
  }

  @SubscribeMessage('trip:unsubscribe')
  handleTripUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tripId: string },
  ) {
    client.leave(`trip:${data.tripId}`);
    this.logger.log(`User ${(client as any).userId} unsubscribed from trip:${data.tripId}`);
  }

  // --- Emit methods ---

  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToAllDrivers(event: string, data: any) {
    this.server.to('drivers').emit(event, data);
  }

  emitToDriver(driverId: string, event: string, data: any) {
    this.server.to(`user:${driverId}`).emit(event, data);
  }

  emitTripUpdate(tripId: string, event: string, data: any) {
    this.server.to(`trip:${tripId}`).emit(event, data);
  }
}
