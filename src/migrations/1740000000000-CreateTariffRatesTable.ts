import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTariffRatesTable1740000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tariff_rates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transportType" varchar NOT NULL,
        "price_per_km" decimal(10,2) NOT NULL,
        "commission_rate" decimal(5,4) NOT NULL DEFAULT 0.15,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tariff_rates" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "tariff_rates" ("transportType", "price_per_km", "commission_rate")
      VALUES
        ('MOTO', 20, 0.15),
        ('AUTO', 30, 0.15),
        ('CAMIONETA', 40, 0.15),
        ('CAMION', 50, 0.15),
        ('SEMI_REMOLQUE', 80, 0.15)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tariff_rates"`);
  }
}
