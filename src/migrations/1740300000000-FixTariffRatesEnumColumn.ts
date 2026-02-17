import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTariffRatesEnumColumn1740300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if tariff_rates exists and transportType is varchar (needs fix)
    const colResult = await queryRunner.query(`
      SELECT data_type, udt_name FROM information_schema.columns
      WHERE table_name = 'tariff_rates' AND column_name = 'transportType'
    `);

    if (colResult.length === 0) return; // table/column doesn't exist

    // If already using the correct enum type, skip
    if (colResult[0].udt_name === 'tariff_rates_transporttype_enum') return;

    // Create the enum type if it doesn't exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tariff_rates_transporttype_enum') THEN
          CREATE TYPE "tariff_rates_transporttype_enum" AS ENUM (
            'CAMION', 'CAMIONETA', 'AUTO', 'MOTO', 'SEMI_REMOLQUE'
          );
        END IF;
      END
      $$
    `);

    // Convert varchar column to enum
    await queryRunner.query(`
      ALTER TABLE "tariff_rates"
      ALTER COLUMN "transportType" TYPE "tariff_rates_transporttype_enum"
      USING "transportType"::"tariff_rates_transporttype_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to varchar if needed
    const colResult = await queryRunner.query(`
      SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'tariff_rates' AND column_name = 'transportType'
    `);

    if (colResult.length === 0) return;
    if (colResult[0].udt_name !== 'tariff_rates_transporttype_enum') return;

    await queryRunner.query(`
      ALTER TABLE "tariff_rates"
      ALTER COLUMN "transportType" TYPE varchar
      USING "transportType"::text
    `);
  }
}
