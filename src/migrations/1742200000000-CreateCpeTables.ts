import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCpeTables1742200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create cpe_records table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cpe_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "trip_id" uuid NOT NULL,
        "cpe_number" varchar(50),
        "cpe_type" int NOT NULL DEFAULT 74,
        "status" varchar(30) NOT NULL DEFAULT 'DRAFT',
        "cuit_solicitante" varchar(20),
        "sucursal" int,
        "nro_orden" bigint,
        "request_payload" jsonb,
        "response_payload" jsonb,
        "afip_error_code" varchar(20),
        "afip_error_message" text,
        "pdf_url" varchar(500),
        "authorized_at" timestamp,
        "voided_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cpe_records" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cpe_records_trip_id" UNIQUE ("trip_id"),
        CONSTRAINT "FK_cpe_records_trip" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE
      )
    `);

    // Create cpe_audit_logs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cpe_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cpe_record_id" uuid NOT NULL,
        "action" varchar(50) NOT NULL,
        "performed_by_id" uuid,
        "request_data" jsonb,
        "response_data" jsonb,
        "error_message" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cpe_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cpe_audit_logs_cpe_record" FOREIGN KEY ("cpe_record_id") REFERENCES "cpe_records"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cpe_audit_logs_user" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // Create afip_delegations table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "afip_delegations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "cuit_delegante" varchar(20) NOT NULL,
        "service_name" varchar(50) NOT NULL DEFAULT 'wscpe',
        "is_active" boolean NOT NULL DEFAULT true,
        "verified_at" timestamp,
        "expires_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_afip_delegations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_afip_delegations_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Add trailer_plate column to vehicles
    await queryRunner.query(`
      ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "trailer_plate" varchar(20)
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cpe_records_status" ON "cpe_records" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cpe_audit_logs_cpe_record_id" ON "cpe_audit_logs" ("cpe_record_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_afip_delegations_user_id" ON "afip_delegations" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_afip_delegations_cuit" ON "afip_delegations" ("cuit_delegante")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_afip_delegations_unique" ON "afip_delegations" ("user_id", "cuit_delegante", "service_name")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "trailer_plate"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cpe_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cpe_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "afip_delegations"`);
  }
}
