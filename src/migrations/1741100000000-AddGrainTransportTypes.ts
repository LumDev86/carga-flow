import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGrainTransportTypes1741100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new transport types
    await queryRunner.query(`ALTER TYPE vehicles_type_enum ADD VALUE IF NOT EXISTS 'CHASIS'`);
    await queryRunner.query(`ALTER TYPE vehicles_type_enum ADD VALUE IF NOT EXISTS 'BATEA'`);
    await queryRunner.query(`ALTER TYPE vehicles_type_enum ADD VALUE IF NOT EXISTS 'BITREN'`);
    // Also for trips table
    await queryRunner.query(`ALTER TYPE trips_transport_type_enum ADD VALUE IF NOT EXISTS 'CHASIS'`);
    await queryRunner.query(`ALTER TYPE trips_transport_type_enum ADD VALUE IF NOT EXISTS 'BATEA'`);
    await queryRunner.query(`ALTER TYPE trips_transport_type_enum ADD VALUE IF NOT EXISTS 'BITREN'`);

    // Add new equipment types
    await queryRunner.query(`ALTER TYPE vehicles_equipment_type_enum ADD VALUE IF NOT EXISTS 'BATEA'`);
    await queryRunner.query(`ALTER TYPE vehicles_equipment_type_enum ADD VALUE IF NOT EXISTS 'ESCALABLE'`);
    await queryRunner.query(`ALTER TYPE vehicles_equipment_type_enum ADD VALUE IF NOT EXISTS 'BITREN'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL doesn't support removing enum values easily
    // Would need to recreate the enum type
  }
}
