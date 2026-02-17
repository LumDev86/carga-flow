import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceCargoTypeEnum1740200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Find the actual enum type name used by the cargo_type column
    const udtResult = await queryRunner.query(`
      SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'trips' AND column_name = 'cargo_type'
    `);

    if (udtResult.length === 0) {
      // No cargo_type column — nothing to migrate
      return;
    }

    const oldEnumName = udtResult[0].udt_name;

    // Step 1: Change column to varchar to remove enum constraint
    await queryRunner.query(`
      ALTER TABLE "trips"
      ALTER COLUMN "cargo_type" TYPE varchar
      USING "cargo_type"::text
    `);

    // Step 2: Map old values to new values
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

    // Step 3: Drop old enum type
    await queryRunner.query(`DROP TYPE IF EXISTS "${oldEnumName}"`);

    // Step 4: Create new enum type with the same name
    await queryRunner.query(`
      CREATE TYPE "${oldEnumName}" AS ENUM (
        'GRANO', 'PALES', 'GRANEL', 'CARGA_GENERAL'
      )
    `);

    // Step 5: Change column back to enum
    await queryRunner.query(`
      ALTER TABLE "trips"
      ALTER COLUMN "cargo_type" TYPE "${oldEnumName}"
      USING "cargo_type"::"${oldEnumName}"
    `);

    // Step 6: Set default
    await queryRunner.query(`
      ALTER TABLE "trips"
      ALTER COLUMN "cargo_type" SET DEFAULT 'CARGA_GENERAL'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const udtResult = await queryRunner.query(`
      SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'trips' AND column_name = 'cargo_type'
    `);

    if (udtResult.length === 0) return;

    const enumName = udtResult[0].udt_name;

    // Change to varchar
    await queryRunner.query(`
      ALTER TABLE "trips"
      ALTER COLUMN "cargo_type" TYPE varchar
      USING "cargo_type"::text
    `);

    // Revert values
    await queryRunner.query(`
      UPDATE "trips" SET "cargo_type" = 'CARGA_SIMPLE' WHERE "cargo_type" = 'CARGA_GENERAL'
    `);
    await queryRunner.query(`
      UPDATE "trips" SET "cargo_type" = 'CARGA_PESADA' WHERE "cargo_type" = 'GRANEL'
    `);
    await queryRunner.query(`
      UPDATE "trips" SET "cargo_type" = 'CARGA_SIMPLE' WHERE "cargo_type" IN ('GRANO', 'PALES')
    `);

    // Recreate old enum
    await queryRunner.query(`DROP TYPE IF EXISTS "${enumName}"`);
    await queryRunner.query(`
      CREATE TYPE "${enumName}" AS ENUM (
        'CARGA_SIMPLE', 'CARGA_PESADA', 'CARGA_EXPRESS', 'CARGA_PEQUENO', 'ENVIO_PREMIUM'
      )
    `);

    // Change back to enum
    await queryRunner.query(`
      ALTER TABLE "trips"
      ALTER COLUMN "cargo_type" TYPE "${enumName}"
      USING "cargo_type"::"${enumName}"
    `);

    await queryRunner.query(`
      ALTER TABLE "trips"
      ALTER COLUMN "cargo_type" SET DEFAULT 'CARGA_SIMPLE'
    `);
  }
}
