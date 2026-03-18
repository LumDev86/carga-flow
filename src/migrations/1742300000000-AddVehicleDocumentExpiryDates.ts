import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVehicleDocumentExpiryDates1742300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_expiry_date DATE`);
    await queryRunner.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS license_expiry_date DATE`);
    await queryRunner.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS art_photo_url VARCHAR(500)`);
    await queryRunner.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS art_expiry_date DATE`);
    await queryRunner.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS rc_photo_url VARCHAR(500)`);
    await queryRunner.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS rc_expiry_date DATE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE vehicles DROP COLUMN IF EXISTS rc_expiry_date`);
    await queryRunner.query(`ALTER TABLE vehicles DROP COLUMN IF EXISTS rc_photo_url`);
    await queryRunner.query(`ALTER TABLE vehicles DROP COLUMN IF EXISTS art_expiry_date`);
    await queryRunner.query(`ALTER TABLE vehicles DROP COLUMN IF EXISTS art_photo_url`);
    await queryRunner.query(`ALTER TABLE vehicles DROP COLUMN IF EXISTS license_expiry_date`);
    await queryRunner.query(`ALTER TABLE vehicles DROP COLUMN IF EXISTS insurance_expiry_date`);
  }
}
