import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArrivalStatusToTrips1743300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN arrival_status VARCHAR`);
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN arrival_observations TEXT`);
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN arrival_status_set_at TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN arrival_status_set_by_id UUID`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS arrival_status`);
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS arrival_observations`);
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS arrival_status_set_at`);
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS arrival_status_set_by_id`);
  }
}
