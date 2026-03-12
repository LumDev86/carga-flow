import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateVehicleTypesAndAxles1740800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add new transport types to enum
    const transportEnums = await queryRunner.query(`
      SELECT t.typname FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname LIKE '%transport%' OR t.typname LIKE '%type%'
      GROUP BY t.typname
      HAVING EXISTS (
        SELECT 1 FROM pg_enum e2 WHERE e2.enumtypid = t.oid AND e2.enumlabel = 'CAMION'
      )
    `);

    for (const { typname } of transportEnums) {
      const existing = await queryRunner.query(`
        SELECT enumlabel FROM pg_enum
        WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = '${typname}')
      `);
      const vals = existing.map((e: any) => e.enumlabel);

      if (!vals.includes('ACOPLADO')) {
        await queryRunner.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS 'ACOPLADO'`);
      }
      if (!vals.includes('BALANCIN')) {
        await queryRunner.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS 'BALANCIN'`);
      }
    }

    // 2. Add new equipment types to enum
    const equipEnums = await queryRunner.query(`
      SELECT t.typname FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname LIKE '%equipment%'
      GROUP BY t.typname
    `);

    for (const { typname } of equipEnums) {
      const existing = await queryRunner.query(`
        SELECT enumlabel FROM pg_enum
        WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = '${typname}')
      `);
      const vals = existing.map((e: any) => e.enumlabel);

      if (!vals.includes('TOLVA')) {
        await queryRunner.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS 'TOLVA'`);
      }
      if (!vals.includes('PLAYO')) {
        await queryRunner.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS 'PLAYO'`);
      }
      if (!vals.includes('CARROZADO')) {
        await queryRunner.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS 'CARROZADO'`);
      }
    }

    // 3. Add axle_count and max_load_ton columns to vehicles
    const columns = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'vehicles' AND column_name IN ('axle_count', 'max_load_ton')
    `);
    const existingCols = columns.map((c: any) => c.column_name);

    if (!existingCols.includes('axle_count')) {
      await queryRunner.query(`ALTER TABLE "vehicles" ADD COLUMN "axle_count" integer NULL`);
    }
    if (!existingCols.includes('max_load_ton')) {
      await queryRunner.query(`ALTER TABLE "vehicles" ADD COLUMN "max_load_ton" decimal(10,2) NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "axle_count"`);
    await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "max_load_ton"`);
  }
}
