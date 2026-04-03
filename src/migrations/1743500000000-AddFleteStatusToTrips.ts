import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFleteStatusToTrips1743500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS flete_status VARCHAR(20) DEFAULT 'PENDING'`);
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS flete_paid_at TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS flete_paid_by_id UUID`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS flete_paid_by_id`);
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS flete_paid_at`);
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS flete_status`);
  }
}
