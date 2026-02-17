import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../../shared/enums/user-role.enum';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly expo = new Expo();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'pushToken'],
      });

      if (!user?.pushToken) {
        return;
      }

      if (!Expo.isExpoPushToken(user.pushToken)) {
        this.logger.warn(`Invalid push token for user ${userId}, cleaning up`);
        await this.userRepository.update(userId, { pushToken: null });
        return;
      }

      const messages: ExpoPushMessage[] = [
        {
          to: user.pushToken,
          sound: 'default',
          title: payload.title,
          body: payload.body,
          data: payload.data || {},
          priority: 'high',
          channelId: 'trip-alerts',
        },
      ];

      await this.sendAndHandleReceipts(messages);
      this.logger.log(`Push sent to user ${userId}: "${payload.title}"`);
    } catch (error: any) {
      this.logger.error(`Failed to send push to user ${userId}: ${error.message}`);
    }
  }

  async sendToAllDrivers(payload: PushPayload): Promise<void> {
    try {
      const drivers = await this.userRepository.find({
        where: {
          rol: UserRole.CHOFER,
          isAvailable: true,
        },
        select: ['id', 'pushToken'],
      });

      const messages: ExpoPushMessage[] = [];

      for (const driver of drivers) {
        if (!driver.pushToken || !Expo.isExpoPushToken(driver.pushToken)) {
          continue;
        }

        messages.push({
          to: driver.pushToken,
          sound: 'default',
          title: payload.title,
          body: payload.body,
          data: payload.data || {},
          priority: 'high',
          channelId: 'trip-alerts',
        });
      }

      if (messages.length === 0) {
        this.logger.log('No drivers with valid push tokens to notify');
        return;
      }

      await this.sendAndHandleReceipts(messages);
      this.logger.log(`Push broadcast sent to ${messages.length} drivers: "${payload.title}"`);
    } catch (error: any) {
      this.logger.error(`Failed to broadcast push to drivers: ${error.message}`);
    }
  }

  private async sendAndHandleReceipts(messages: ExpoPushMessage[]): Promise<void> {
    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error: any) {
        this.logger.error(`Error sending push chunk: ${error.message}`);
      }
    }

    // Check receipts after 15 seconds (fire-and-forget)
    setTimeout(() => this.checkReceipts(tickets, messages), 15_000);
  }

  private async checkReceipts(
    tickets: ExpoPushTicket[],
    messages: ExpoPushMessage[],
  ): Promise<void> {
    try {
      const receiptIds: string[] = [];
      for (const ticket of tickets) {
        if ('id' in ticket) {
          receiptIds.push(ticket.id);
        }
      }

      if (receiptIds.length === 0) return;

      const receiptIdChunks = this.expo.chunkPushNotificationReceiptIds(receiptIds);

      for (const chunk of receiptIdChunks) {
        const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);

        for (const [receiptId, receipt] of Object.entries(receipts)) {
          if (receipt.status === 'error') {
            this.logger.error(`Push receipt error: ${receipt.message}`);

            if (receipt.details?.error === 'DeviceNotRegistered') {
              // Find the token from the original message and clean it up
              const ticketIndex = receiptIds.indexOf(receiptId);
              if (ticketIndex >= 0 && ticketIndex < messages.length) {
                const token = messages[ticketIndex].to as string;
                await this.userRepository.update(
                  { pushToken: token },
                  { pushToken: null },
                );
                this.logger.log(`Cleaned up invalid push token: ${token}`);
              }
            }
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`Error checking push receipts: ${error.message}`);
    }
  }
}
