import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTripDocumentsTable1741300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE trip_documents_type_enum AS ENUM ('CARTA_DE_PORTE', 'REMITO', 'REMITO_ELECTRONICO', 'OTRO')
    `);
    await queryRunner.query(`
      CREATE TABLE trip_documents (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        type trip_documents_type_enum NOT NULL DEFAULT 'OTRO',
        url VARCHAR(1000) NOT NULL,
        filename VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_trip_documents_trip_id ON trip_documents(trip_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS trip_documents`);
    await queryRunner.query(`DROP TYPE IF EXISTS trip_documents_type_enum`);
  }
}
