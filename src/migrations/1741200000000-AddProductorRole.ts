import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductorRole1741200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE users_rol_enum ADD VALUE IF NOT EXISTS 'PRODUCTOR'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL doesn't support removing enum values easily
  }
}
