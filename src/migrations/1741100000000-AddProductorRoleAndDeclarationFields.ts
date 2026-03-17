import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductorRoleAndDeclarationFields1741100000000 implements MigrationInterface {
  name = 'AddProductorRoleAndDeclarationFields1741100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add PRODUCTOR to user role enum
    await queryRunner.query(`
      ALTER TYPE users_rol_enum ADD VALUE IF NOT EXISTS 'PRODUCTOR';
    `);

    // Declaration acceptance fields
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS has_accepted_declaration BOOLEAN DEFAULT false;
    `);
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS declaration_accepted_at TIMESTAMP;
    `);

    // Intermediation authorization fields
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS has_signed_intermediation_auth BOOLEAN DEFAULT false;
    `);
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS intermediation_signed_at TIMESTAMP;
    `);
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS intermediation_company_name VARCHAR(255);
    `);
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS intermediation_company_cuit VARCHAR(20);
    `);
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS intermediation_representative_name VARCHAR(255);
    `);
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS intermediation_representative_role VARCHAR(100);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS intermediation_representative_role;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS intermediation_representative_name;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS intermediation_company_cuit;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS intermediation_company_name;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS intermediation_signed_at;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS has_signed_intermediation_auth;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS declaration_accepted_at;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS has_accepted_declaration;`);
    // PostgreSQL no soporta eliminar valores de enum sin recrear el tipo
  }
}
