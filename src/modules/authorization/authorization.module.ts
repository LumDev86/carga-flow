import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntermediationAuth } from './entities/intermediation-auth.entity';
import { User } from '../users/entities/user.entity';
import { AuthorizationController } from './authorization.controller';
import { AuthorizationService } from './authorization.service';

@Module({
  imports: [TypeOrmModule.forFeature([IntermediationAuth, User])],
  controllers: [AuthorizationController],
  providers: [AuthorizationService],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
