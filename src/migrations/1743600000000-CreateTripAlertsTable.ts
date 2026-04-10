import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTripAlertsTable1743600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enums
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trip_alerts_type_enum') THEN
          CREATE TYPE "trip_alerts_type_enum" AS ENUM (
            'DEMORA_DESCARGA',
            'PROBLEMA_CALIDAD',
            'FALTA_DOCUMENTACION',
            'PROBLEMA_CARGA',
            'URGENCIA_CLIMA',
            'CAMBIO_TURNO',
            'OTRO'
          );
        END IF;
      END
      $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trip_alerts_priority_enum') THEN
          CREATE TYPE "trip_alerts_priority_enum" AS ENUM ('NORMAL', 'URGENTE');
        END IF;
      END
      $$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trip_alerts_status_enum') THEN
          CREATE TYPE "trip_alerts_status_enum" AS ENUM (
            'SENT',
            'DELIVERED',
            'READ',
            'ACKNOWLEDGED',
            'CANCELLED'
          );
        END IF;
      END
      $$
    `);

    // Tabla
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trip_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        port_id UUID NOT NULL REFERENCES ports(id),
        sent_by_user_id UUID NOT NULL REFERENCES users(id),
        receiver_id UUID NOT NULL REFERENCES users(id),
        type "trip_alerts_type_enum" NOT NULL,
        priority "trip_alerts_priority_enum" NOT NULL DEFAULT 'NORMAL',
        message TEXT,
        status "trip_alerts_status_enum" NOT NULL DEFAULT 'SENT',
        sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
        delivered_at TIMESTAMP,
        read_at TIMESTAMP,
        acknowledged_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        cancel_reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Índices
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_trip_alerts_trip_id ON trip_alerts(trip_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_trip_alerts_receiver_id ON trip_alerts(receiver_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_trip_alerts_port_id ON trip_alerts(port_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_trip_alerts_receiver_status ON trip_alerts(receiver_id, status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS trip_alerts`);
    await queryRunner.query(`DROP TYPE IF EXISTS "trip_alerts_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "trip_alerts_priority_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "trip_alerts_type_enum"`);
  }
}
