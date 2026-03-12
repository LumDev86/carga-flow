import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodEnumValues1740700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new payment method values to the PostgreSQL enum type
    // TypeORM creates the enum as "trips_paymentmethod_enum" or "trips_payment_method_enum"
    // We try both naming conventions to be safe

    const enumTypes = await queryRunner.query(`
      SELECT t.typname
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname LIKE '%payment_method%' OR t.typname LIKE '%paymentmethod%'
      GROUP BY t.typname
    `);

    for (const { typname } of enumTypes) {
      // Check existing values
      const existing = await queryRunner.query(`
        SELECT enumlabel FROM pg_enum
        WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = '${typname}')
      `);
      const existingValues = existing.map((e: any) => e.enumlabel);

      if (!existingValues.includes('BANK_TRANSFER')) {
        await queryRunner.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS 'BANK_TRANSFER'`);
      }
      if (!existingValues.includes('CHECK')) {
        await queryRunner.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS 'CHECK'`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL doesn't support removing enum values easily
    // The values BANK_TRANSFER and CHECK will remain but won't cause issues
  }
}
