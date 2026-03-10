import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGrainTariffRatesTable1740600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "grain_tariff_rates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "km" integer NOT NULL,
        "price_per_ton" decimal(12,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_grain_tariff_rates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_grain_tariff_rates_km" UNIQUE ("km")
      )
    `);

    // Crear índice para búsqueda rápida por km
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_grain_tariff_rates_km" ON "grain_tariff_rates" ("km")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "grain_tariff_rates"`);
  }
}
