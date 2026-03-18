import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTripIncidentsTable1742500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE incident_type_enum AS ENUM ('ROTURA', 'PROBLEMA_MECANICO', 'DEMORA_PUERTO', 'ACCIDENTE', 'OTRO')
    `);

    await queryRunner.query(`
      CREATE TYPE incident_status_enum AS ENUM ('REPORTED', 'ACKNOWLEDGED', 'RESOLVED')
    `);

    await queryRunner.query(`
      CREATE TABLE trip_incidents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        reported_by_id UUID NOT NULL REFERENCES users(id),
        type incident_type_enum NOT NULL,
        description TEXT NOT NULL,
        status incident_status_enum NOT NULL DEFAULT 'REPORTED',
        photos JSONB NOT NULL DEFAULT '[]',
        admin_notes TEXT,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_trip_incidents_trip_id ON trip_incidents(trip_id)`);
    await queryRunner.query(`CREATE INDEX idx_trip_incidents_status ON trip_incidents(status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE trip_incidents`);
    await queryRunner.query(`DROP TYPE incident_status_enum`);
    await queryRunner.query(`DROP TYPE incident_type_enum`);
  }
}
