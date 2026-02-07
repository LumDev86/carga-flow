import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GeolocationModule } from './modules/geolocation/geolocation.module';
import { RedisModule } from './common/cache/redis.module';
import { EventsModule } from './modules/events/events.module';
import { TripsModule } from './modules/trips/trips.module';

// Check if Redis is configured
const isRedisConfigured = () => {
  return !!(process.env.REDIS_HOST && process.env.REDIS_PORT);
};

// Conditionally include Bull module
const conditionalImports = isRedisConfigured()
  ? [
      BullModule.forRootAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          redis: {
            host: configService.get('REDIS_HOST'),
            port: configService.get<number>('REDIS_PORT'),
            username: configService.get('REDIS_USERNAME'),
            password: configService.get('REDIS_PASSWORD'),
          },
        }),
      }),
    ]
  : [];

@Module({
  imports: [
    // Load environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database (TypeORM + PostgreSQL)
    DatabaseModule,

    // Bull Queue (Redis) - only if configured
    ...conditionalImports,

    // Redis cache
    RedisModule,

    // Feature modules
    AuthModule,
    UsersModule,
    GeolocationModule,
    EventsModule,
    TripsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
