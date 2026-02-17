import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEquipmentTypeToVehicles1740100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'equipment_type_enum') THEN
          CREATE TYPE "equipment_type_enum" AS ENUM (
            'BARANDA_REBATIBLE',
            'BARANDA_FIJA',
            'CISTERNA',
            'FURGON'
          );
        END IF;
      END
      $$
    `);

    // Add column if not exists
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'vehicles' AND column_name = 'equipment_type'
        ) THEN
          ALTER TABLE "vehicles" ADD COLUMN "equipment_type" "equipment_type_enum" NULL;
        END IF;
      END
      $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "equipment_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "equipment_type_enum"`);
  }
}
