import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { CpeModule } from '../cpe/cpe.module';
import { CuitValidationRetryCron } from './workers/cuit-validation-retry.cron';

@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshToken]), CpeModule],
  controllers: [UsersController],
  providers: [UsersService, CuitValidationRetryCron],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
