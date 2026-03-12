import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentSystemFields1740900000000 implements MigrationInterface {
  name = 'AddPaymentSystemFields1740900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- User bank info fields ---
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS cbu VARCHAR(22);
    `);
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_alias VARCHAR(50);
    `);
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);
    `);
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_holder_name VARCHAR(200);
    `);

    // --- Trip flete tracking fields ---
    await queryRunner.query(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS flete_received_at TIMESTAMP;
    `);
    await queryRunner.query(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS flete_amount DECIMAL(10,2);
    `);
    await queryRunner.query(`
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_credited_at TIMESTAMP;
    `);

    // --- Withdrawal status enum ---
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE withdrawal_requests_status_enum AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // --- Withdrawal requests table ---
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS withdrawal_requests (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id),
        amount DECIMAL(10,2) NOT NULL,
        status withdrawal_requests_status_enum NOT NULL DEFAULT 'PENDING',
        bank_cbu VARCHAR(22),
        bank_alias VARCHAR(50),
        bank_name VARCHAR(100),
        bank_holder_name VARCHAR(200),
        admin_note TEXT,
        rejection_reason TEXT,
        transfer_reference VARCHAR(100),
        processed_at TIMESTAMP,
        rejected_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Index for fast lookup of pending withdrawals
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
    `);

    // --- Add WITHDRAWAL to wallet transaction type enum ---
    await queryRunner.query(`
      ALTER TYPE wallet_transactions_type_enum ADD VALUE IF NOT EXISTS 'WITHDRAWAL';
    `);

    // --- Update existing delivered trips with pending paymentStatus to pending_flete ---
    await queryRunner.query(`
      UPDATE trips
      SET payment_status = 'pending_flete'
      WHERE status = 'DELIVERED'
        AND (payment_status = 'pending' OR payment_status IS NULL)
        AND driver_credited_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS withdrawal_requests;`);
    await queryRunner.query(`DROP TYPE IF EXISTS withdrawal_requests_status_enum;`);
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS flete_received_at;`);
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS flete_amount;`);
    await queryRunner.query(`ALTER TABLE trips DROP COLUMN IF EXISTS driver_credited_at;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS cbu;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS bank_alias;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS bank_name;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS bank_holder_name;`);
  }
}
