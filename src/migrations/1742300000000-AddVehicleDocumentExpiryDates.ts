import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVehicleDocumentExpiryDates1742300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE vehicles ADD COLUMN insurance_expiry_date DATE`);
    await queryRunner.query(`ALTER TABLE vehicles ADD COLUMN license_expiry_date DATE`);
    await queryRunner.query(`ALTER TABLE vehicles ADD COLUMN art_photo_url VARCHAR(500)`);
    await queryRunner.query(`ALTER TABLE vehicles ADD COLUMN art_expiry_date DATE`);
    await queryRunner.query(`ALTER TABLE vehicles ADD COLUMN rc_photo_url VARCHAR(500)`);
    await queryRunner.query(`ALTER TABLE vehicles ADD COLUMN rc_expiry_date DATE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE vehicles DROP COLUMN rc_expiry_date`);
    await queryRunner.query(`ALTER TABLE vehicles DROP COLUMN rc_photo_url`);
    await queryRunner.query(`ALTER TABLE vehicles DROP COLUMN art_expiry_date`);
    await queryRunner.query(`ALTER TABLE vehicles DROP COLUMN art_photo_url`);
    await queryRunner.query(`ALTER TABLE vehicles DROP COLUMN license_expiry_date`);
    await queryRunner.query(`ALTER TABLE vehicles DROP COLUMN insurance_expiry_date`);
  }
}
