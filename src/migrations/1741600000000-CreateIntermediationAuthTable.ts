import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIntermediationAuthTable1741600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN has_signed_intermediation_auth BOOLEAN DEFAULT FALSE
    `);
    await queryRunner.query(`
      CREATE TABLE intermediation_authorizations (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_name VARCHAR(255) NOT NULL,
        company_cuit VARCHAR(20) NOT NULL,
        representative_name VARCHAR(255),
        representative_role VARCHAR(100),
        signed_at TIMESTAMP NOT NULL,
        document_url VARCHAR(1000),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_intermediation_auth_user_id ON intermediation_authorizations(user_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS intermediation_authorizations`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS has_signed_intermediation_auth`);
  }
}
