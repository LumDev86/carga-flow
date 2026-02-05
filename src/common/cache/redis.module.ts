import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get('REDIS_HOST');
        const redisPort = configService.get('REDIS_PORT');
        const logger = new Logger('RedisModule');

        // If Redis is not configured, use in-memory cache
        if (!redisHost || !redisPort) {
          logger.warn('Redis not configured - using in-memory cache');
          return {
            ttl: 3600,
          };
        }

        // Redis is configured, use Redis store
        try {
          const { redisStore } = await import('cache-manager-ioredis-yet');
          const store = await redisStore({
            host: redisHost,
            port: redisPort,
            username: configService.get('REDIS_USERNAME'),
            password: configService.get('REDIS_PASSWORD'),
            ttl: configService.get('REDIS_TTL') || 3600,
          });

          logger.log('Connected to Redis cache');
          return { store };
        } catch (error) {
          logger.warn(`Failed to connect to Redis: ${error.message} - using in-memory cache`);
          return {
            ttl: 3600,
          };
        }
      },
      isGlobal: true,
    }),
  ],
  exports: [CacheModule],
})
export class RedisModule {}
