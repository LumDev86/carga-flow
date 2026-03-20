import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPortIdsToTrips1743100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN origin_port_id UUID`);
    await queryRunner.query(`ALTER TABLE trips ADD COLUMN destination_port_id UUID`);
    await queryRunner.query(
      `ALTER TABLE trips ADD CONSTRAINT fk_trips_origin_port_id FOREIGN KEY (origin_port_id) REFERENCES ports(id) ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE trips ADD CONSTRAINT fk_trips_destination_port_id FOREIGN KEY (destination_port_id) REFERENCES ports(id) ON DELETE SET NULL`,
    );
    await queryRunner.query(`CREATE INDEX idx_trips_origin_port_id ON trips(origin_port_id)`);
    await queryRunner.query(`CREATE INDEX idx_trips_destination_port_id ON trips(destination_port_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_trips_destination_port_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_trips_origin_port_id`);
    await queryRunner.query(`ALTER TABLE trips DROP CONSTRAINT IF EXISTS fk_trips_destination_port_id`);
    await queryRunner.query(`ALTER TABLE trips DROP CONSTRAINT IF EXISTS fk_trips_origin_port_id`);
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS destination_port_id`);
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS origin_port_id`);
  }
}
