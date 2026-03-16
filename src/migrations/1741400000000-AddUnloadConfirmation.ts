import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnloadConfirmation1741400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN unload_confirmed_at TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN unload_confirmed_by_id UUID`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS unload_confirmed_at`);
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS unload_confirmed_by_id`);
  }
}
