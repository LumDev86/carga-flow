import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrecintoAndSealPhoto1742400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE document_type_enum ADD VALUE IF NOT EXISTS 'PRECINTO'`);
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN seal_photo_url VARCHAR(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN seal_photo_url`);
  }
}
