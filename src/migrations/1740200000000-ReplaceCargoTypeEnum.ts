import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceCargoTypeEnum1740200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if the old enum type exists and has old values
    const enumExists = await queryRunner.query(`
      SELECT 1 FROM pg_type WHERE typname = 'trips_cargotype_enum'
        OR typname = 'trips_cargo_type_enum'
        OR typname = 'cargo_type_enum'
    `);

    if (enumExists.length === 0) {
      // No existing enum — nothing to migrate
      return;
    }

    // Map old cargo types to new ones
    await queryRunner.query(`
      UPDATE "trips"
      SET "cargo_type" = 'CARGA_GENERAL'
      WHERE "cargo_type" IN ('CARGA_SIMPLE', 'CARGA_EXPRESS', 'CARGA_PEQUENO', 'ENVIO_PREMIUM')
    `);

    await queryRunner.query(`
      UPDATE "trips"
      SET "cargo_type" = 'GRANEL'
      WHERE "cargo_type" = 'CARGA_PESADA'
    `);

    // Try to alter the enum type by adding new values if they don't exist
    const addEnumValueSafe = async (value: string) => {
      try {
        // Find the actual enum type name used by the cargo_type column
        const result = await queryRunner.query(`
          SELECT udt_name FROM information_schema.columns
          WHERE table_name = 'trips' AND column_name = 'cargo_type'
        `);
        if (result.length > 0) {
          const enumName = result[0].udt_name;
          await queryRunner.query(
            `ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS '${value}'`,
          );
        }
      } catch {
        // Value might already exist
      }
    };

    await addEnumValueSafe('GRANO');
    await addEnumValueSafe('PALES');
    await addEnumValueSafe('GRANEL');
    await addEnumValueSafe('CARGA_GENERAL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert new types to old ones
    await queryRunner.query(`
      UPDATE "trips"
      SET "cargo_type" = 'CARGA_SIMPLE'
      WHERE "cargo_type" = 'CARGA_GENERAL'
    `);

    await queryRunner.query(`
      UPDATE "trips"
      SET "cargo_type" = 'CARGA_PESADA'
      WHERE "cargo_type" = 'GRANEL'
    `);

    await queryRunner.query(`
      UPDATE "trips"
      SET "cargo_type" = 'CARGA_SIMPLE'
      WHERE "cargo_type" IN ('GRANO', 'PALES')
    `);
  }
}
