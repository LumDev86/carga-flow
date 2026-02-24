import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCartaDePorteUrlToTrips1740500000000 implements MigrationInterface {
  name = 'AddCartaDePorteUrlToTrips1740500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "trips"
      ADD COLUMN IF NOT EXISTS "carta_de_porte_url" varchar NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "trips" DROP COLUMN IF EXISTS "carta_de_porte_url"`);
  }
}
