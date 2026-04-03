import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';
import { PushNotificationService } from './push-notification.service';
import { NotificationService } from './notification.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Notification])],
  providers: [PushNotificationService, NotificationService],
  exports: [PushNotificationService, NotificationService],
})
export class NotificationsModule {}
