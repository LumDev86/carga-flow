import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPortIdToUsers1743000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN port_id UUID`);
    await queryRunner.query(
      `ALTER TABLE users ADD CONSTRAINT fk_users_port_id FOREIGN KEY (port_id) REFERENCES ports(id) ON DELETE SET NULL`,
    );
    await queryRunner.query(`CREATE INDEX idx_users_port_id ON users(port_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_port_id`);
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_port_id`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS port_id`);
  }
}
