import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameGranoToGranosDerivados1741000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Renombrar el valor del enum primero, luego los datos se actualizan automáticamente
    await queryRunner.query(`ALTER TYPE trips_cargo_type_enum RENAME VALUE 'GRANO' TO 'GRANOS_DERIVADOS'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE trips_cargo_type_enum RENAME VALUE 'GRANOS_DERIVADOS' TO 'GRANO'`);
  }
}
