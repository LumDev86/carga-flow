import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        ...(configService.get<string>('DATABASE_URL')
          ? { url: configService.get<string>('DATABASE_URL') }
          : {
              host: configService.get<string>('DB_HOST'),
              port: parseInt(configService.get<string>('DB_PORT') || '5432', 10),
              username: configService.get<string>('DB_USERNAME'),
              password: configService.get<string>('DB_PASSWORD'),
              database: configService.get<string>('DB_DATABASE'),
            }),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../migrations/*{.ts,.js}'],
        migrationsRun: true,
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
        logging: configService.get<string>('NODE_ENV') !== 'production',
        ssl: configService.get<string>('DATABASE_URL')
          ? { rejectUnauthorized: false }
          : configService.get<string>('DB_SSL') === 'true'
            ? { rejectUnauthorized: false }
            : false,
        // Pool: 30 conexiones (vs default 10) para que endpoints con queries
        // paralelas (ej. port-portal/dashboard) no agoten el pool y se cuelguen.
        // idle/connect timeouts evitan que conexiones zombies queden colgadas
        // tras blips de red al pooler de Supabase.
        extra: {
          max: 30,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
