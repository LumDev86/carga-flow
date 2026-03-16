import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverRating1741500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN driver_rating INT`);
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN driver_rating_comments TEXT`);
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN driver_rated_at TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS driver_rating`);
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS driver_rating_comments`);
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS driver_rated_at`);
  }
}
