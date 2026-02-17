import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { PushNotificationService } from './push-notification.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [PushNotificationService],
  exports: [PushNotificationService],
})
export class NotificationsModule {}
