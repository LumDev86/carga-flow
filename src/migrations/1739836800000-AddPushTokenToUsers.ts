import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPushTokenToUsers1739836800000 implements MigrationInterface {
  name = 'AddPushTokenToUsers1739836800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "push_token" varchar(200) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "push_token"`);
  }
}
