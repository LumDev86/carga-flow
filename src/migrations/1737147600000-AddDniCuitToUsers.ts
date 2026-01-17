import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDniCuitToUsers1737147600000 implements MigrationInterface {
  name = 'AddDniCuitToUsers1737147600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add dni column
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "dni" varchar(20) NULL
    `);

    // Add cuit column
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "cuit" varchar(20) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "cuit"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "dni"`);
  }
}
