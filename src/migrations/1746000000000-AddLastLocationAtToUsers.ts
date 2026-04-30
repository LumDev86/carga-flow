import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega timestamp de la última actualización de ubicación del chofer.
 * Permite distinguir "online ahora" vs "última posición conocida hace X tiempo"
 * en los mapas en vivo del CRM y portal de puertos.
 *
 * Aditivo: la columna es nullable, no rompe rows existentes ni el flow del GPS uploader.
 */
export class AddLastLocationAtToUsers1746000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMP NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_last_location_at
      ON users (last_location_at)
      WHERE last_location_at IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_last_location_at`);
    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN IF EXISTS last_location_at
    `);
  }
}
