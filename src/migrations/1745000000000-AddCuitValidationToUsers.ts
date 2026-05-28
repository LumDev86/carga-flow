import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Anti-spam: valida CUIT contra AFIP al registrarse como SOLICITANTE/PRODUCTOR
 * y cuenta viajes completados como dador para relajar rate-limits.
 */
export class AddCuitValidationToUsers1745000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS cuit_verified_at TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS cuit_razon_social VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS cuit_tipo_persona VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS cuit_condicion_fiscal VARCHAR(100) NULL,
        ADD COLUMN IF NOT EXISTS cuit_validation_error VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS cuit_last_validation_attempt_at TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS completed_trips_as_requester INT NOT NULL DEFAULT 0
    `);

    // Backfill: dadores con viajes DELIVERED existentes quedan "grandfathered".
    await queryRunner.query(`
      UPDATE users u
      SET completed_trips_as_requester = sub.cnt
      FROM (
        SELECT requester_id, COUNT(*)::int AS cnt
        FROM trips
        WHERE status = 'DELIVERED' AND requester_id IS NOT NULL
        GROUP BY requester_id
      ) sub
      WHERE u.id = sub.requester_id
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_cuit_verified_at ON users (cuit_verified_at)
      WHERE cuit_verified_at IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_cuit_validation_error ON users (cuit_validation_error)
      WHERE cuit_validation_error IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_cuit_validation_error`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_cuit_verified_at`);
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS completed_trips_as_requester,
        DROP COLUMN IF EXISTS cuit_last_validation_attempt_at,
        DROP COLUMN IF EXISTS cuit_validation_error,
        DROP COLUMN IF EXISTS cuit_condicion_fiscal,
        DROP COLUMN IF EXISTS cuit_tipo_persona,
        DROP COLUMN IF EXISTS cuit_razon_social,
        DROP COLUMN IF EXISTS cuit_verified_at
    `);
  }
}
