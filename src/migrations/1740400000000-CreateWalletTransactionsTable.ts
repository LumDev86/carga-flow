import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalletTransactionsTable1740400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for wallet transaction types
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_transactions_type_enum') THEN
          CREATE TYPE "wallet_transactions_type_enum" AS ENUM (
            'CREDIT', 'DEBIT', 'ESCROW_CAPTURE', 'COMMISSION'
          );
        END IF;
      END
      $$
    `);

    // Create wallet_transactions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallet_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "trip_id" uuid,
        "type" "wallet_transactions_type_enum" NOT NULL,
        "amount" decimal(10,2) NOT NULL,
        "balance_before" decimal(10,2) NOT NULL,
        "balance_after" decimal(10,2) NOT NULL,
        "description" varchar(500) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wallet_transactions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Index for fast lookups by user
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_wallet_transactions_user_id" ON "wallet_transactions" ("user_id")
    `);

    // Index for ordering by date
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_wallet_transactions_created_at" ON "wallet_transactions" ("created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet_transactions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "wallet_transactions_type_enum"`);
  }
}
