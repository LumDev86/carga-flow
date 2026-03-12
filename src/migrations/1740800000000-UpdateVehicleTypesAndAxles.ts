import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateVehicleTypesAndAxles1740800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add new transport types to all relevant enums
    const transportEnums = await queryRunner.query(`
      SELECT DISTINCT t.typname FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE (t.typname LIKE '%transport%' OR t.typname LIKE '%type%')
        AND e.enumlabel = 'CAMION'
    `);

    for (const { typname } of transportEnums) {
      await queryRunner.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS 'ACOPLADO'`);
      await queryRunner.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS 'BALANCIN'`);
    }

    // 2. Add new equipment types to enum
    const equipEnums = await queryRunner.query(`
      SELECT DISTINCT t.typname FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname LIKE '%equipment%'
    `);

    for (const { typname } of equipEnums) {
      await queryRunner.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS 'TOLVA'`);
      await queryRunner.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS 'PLAYO'`);
      await queryRunner.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS 'CARROZADO'`);
    }

    // 3. Add axle_count and max_load_ton columns to vehicles
    await queryRunner.query(`ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "axle_count" integer NULL`);
    await queryRunner.query(`ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "max_load_ton" decimal(10,2) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "axle_count"`);
    await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "max_load_ton"`);
  }
}
