import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fuel tracking schema — FASE 1.1
 *
 * Creates the full schema needed for the real-time gasoil adjustment feature.
 * Idempotent: safe to run multiple times. See docs/fuel-tracking/ERD.md.
 *
 * New enums:
 *   fuel_type_enum, fuel_source_enum, adjustment_status_enum,
 *   adjustment_policy_enum, pricing_mode_enum
 *
 * New tables:
 *   fuel_price_history (append-only, ADR-002)
 *   trip_fuel_snapshots (immutable per-trip, ADR-001)
 *   trip_fuel_adjustments (per price change, ADR-001/004/009)
 *   trip_location_history (GPS tracklog, ADR-011)
 *   integration_outbox (async event propagation, ADR-003)
 *   feature_flags (runtime config, ADR-010)
 *   fuel_adjustment_notifications (audit trail, ADR-012)
 *
 * Altered tables:
 *   vehicles (+ fuel_consumption, fuel_type)
 *   trips (+ pricing_mode, fuel_snapshot_id, base_fuel_cost,
 *          total_fuel_adjustment, actual_final_amount)
 */
export class CreateFuelTrackingTables1744000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------------
    // 1. Enums
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fuel_type_enum') THEN
          CREATE TYPE "fuel_type_enum" AS ENUM ('COMUN', 'PREMIUM');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fuel_source_enum') THEN
          CREATE TYPE "fuel_source_enum" AS ENUM (
            'MANUAL_ADMIN',
            'API_YPF',
            'API_ENARGAS',
            'SYSTEM_ROLLBACK'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'adjustment_status_enum') THEN
          CREATE TYPE "adjustment_status_enum" AS ENUM (
            'PROPOSED',
            'AUTO_APPLIED',
            'ACCEPTED',
            'REJECTED',
            'EXPIRED'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'adjustment_policy_enum') THEN
          CREATE TYPE "adjustment_policy_enum" AS ENUM (
            'SILENT',
            'INFORMATIVE',
            'EXPLICIT'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pricing_mode_enum') THEN
          CREATE TYPE "pricing_mode_enum" AS ENUM ('FIXED', 'REALTIME');
        END IF;
      END $$;
    `);

    // ---------------------------------------------------------------------
    // 2. fuel_price_history (append-only, ADR-002)
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fuel_price_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fuel_type "fuel_type_enum" NOT NULL,
        price_per_liter DECIMAL(10,2) NOT NULL CHECK (price_per_liter > 0),
        effective_from TIMESTAMPTZ NOT NULL,
        source "fuel_source_enum" NOT NULL DEFAULT 'MANUAL_ADMIN',
        source_ref VARCHAR(255),
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        notes TEXT,
        idempotency_key VARCHAR(255)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fuel_price_idempotency
        ON fuel_price_history (idempotency_key)
        WHERE idempotency_key IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fuel_price_history_type_effective
        ON fuel_price_history (fuel_type, effective_from DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fuel_price_history_effective_brin
        ON fuel_price_history USING BRIN (effective_from)
    `);

    // ---------------------------------------------------------------------
    // 3. trip_fuel_snapshots (immutable per-trip, ADR-001)
    //    Note: FK trip_id → trips created after trips.fuel_snapshot_id column exists
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trip_fuel_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
        fuel_type "fuel_type_enum" NOT NULL,
        initial_price_per_liter DECIMAL(10,2) NOT NULL,
        initial_price_history_id UUID NOT NULL REFERENCES fuel_price_history(id),
        vehicle_fuel_consumption DECIMAL(6,2) NOT NULL
          CHECK (vehicle_fuel_consumption > 0 AND vehicle_fuel_consumption < 200),
        estimated_total_km DECIMAL(10,2) NOT NULL,
        estimated_total_liters DECIMAL(10,2) NOT NULL,
        config_snapshot JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ---------------------------------------------------------------------
    // 4. trip_fuel_adjustments (per price change, ADR-001/004/009)
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trip_fuel_adjustments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        snapshot_id UUID NOT NULL REFERENCES trip_fuel_snapshots(id),
        triggering_price_history_id UUID NOT NULL REFERENCES fuel_price_history(id),
        old_price DECIMAL(10,2) NOT NULL,
        new_price DECIMAL(10,2) NOT NULL,
        pct_change DECIMAL(6,4) NOT NULL,
        km_traveled_at_trigger DECIMAL(10,2) NOT NULL,
        km_remaining_at_trigger DECIMAL(10,2) NOT NULL,
        liters_remaining DECIMAL(10,2) NOT NULL,
        adjustment_amount DECIMAL(10,2) NOT NULL
          CHECK (adjustment_amount > -1000000 AND adjustment_amount < 1000000),
        status "adjustment_status_enum" NOT NULL DEFAULT 'PROPOSED',
        policy_applied "adjustment_policy_enum" NOT NULL,
        responded_by UUID REFERENCES users(id),
        responded_at TIMESTAMPTZ,
        rejection_reason TEXT,
        auto_apply_deadline TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_trip_adjustments_per_price UNIQUE (trip_id, triggering_price_history_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_trip_fuel_adj_trip_status
        ON trip_fuel_adjustments (trip_id, status)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_trip_fuel_adj_deadline
        ON trip_fuel_adjustments (auto_apply_deadline)
        WHERE status = 'PROPOSED'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_trip_fuel_adj_triggering
        ON trip_fuel_adjustments (triggering_price_history_id)
    `);

    // ---------------------------------------------------------------------
    // 5. trip_location_history (GPS tracklog, ADR-011)
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trip_location_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        latitude DECIMAL(10,7) NOT NULL,
        longitude DECIMAL(10,7) NOT NULL,
        speed_kmh DECIMAL(6,2),
        accuracy_m DECIMAL(8,2),
        recorded_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_trip_location_trip_time
        ON trip_location_history (trip_id, recorded_at)
    `);

    // ---------------------------------------------------------------------
    // 6. integration_outbox (async event propagation, ADR-003)
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration_outbox (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        aggregate_type VARCHAR(100) NOT NULL,
        aggregate_id UUID NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        attempts INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        last_error TEXT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_outbox_pending
        ON integration_outbox (status, created_at)
        WHERE status = 'PENDING'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_outbox_aggregate
        ON integration_outbox (aggregate_type, aggregate_id)
    `);

    // ---------------------------------------------------------------------
    // 7. feature_flags (runtime config, ADR-010)
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS feature_flags (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        description TEXT,
        updated_by UUID REFERENCES users(id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ---------------------------------------------------------------------
    // 8. fuel_adjustment_notifications (audit, ADR-012)
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fuel_adjustment_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        adjustment_id UUID NOT NULL REFERENCES trip_fuel_adjustments(id) ON DELETE CASCADE,
        channel VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL,
        sent_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        read_at TIMESTAMPTZ,
        pdf_url TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fuel_adj_notif_adjustment
        ON fuel_adjustment_notifications (adjustment_id)
    `);

    // ---------------------------------------------------------------------
    // 9. Alter vehicles: fuel_consumption + fuel_type
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE vehicles
        ADD COLUMN IF NOT EXISTS fuel_consumption DECIMAL(6,2)
          CHECK (fuel_consumption IS NULL OR (fuel_consumption > 0 AND fuel_consumption < 200))
    `);

    await queryRunner.query(`
      ALTER TABLE vehicles
        ADD COLUMN IF NOT EXISTS fuel_type "fuel_type_enum" NOT NULL DEFAULT 'COMUN'
    `);

    // ---------------------------------------------------------------------
    // 10. Alter trips: pricing_mode, fuel_snapshot_id, base_fuel_cost,
    //     total_fuel_adjustment, actual_final_amount
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE trips
        ADD COLUMN IF NOT EXISTS pricing_mode "pricing_mode_enum" NOT NULL DEFAULT 'REALTIME'
    `);

    await queryRunner.query(`
      ALTER TABLE trips
        ADD COLUMN IF NOT EXISTS fuel_snapshot_id UUID
    `);

    await queryRunner.query(`
      ALTER TABLE trips
        ADD COLUMN IF NOT EXISTS base_fuel_cost DECIMAL(10,2)
    `);

    await queryRunner.query(`
      ALTER TABLE trips
        ADD COLUMN IF NOT EXISTS total_fuel_adjustment DECIMAL(10,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE trips
        ADD COLUMN IF NOT EXISTS actual_final_amount DECIMAL(10,2)
    `);

    // FK trips.fuel_snapshot_id → trip_fuel_snapshots.id
    // Check first to make idempotent
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'fk_trips_fuel_snapshot'
        ) THEN
          ALTER TABLE trips
            ADD CONSTRAINT fk_trips_fuel_snapshot
            FOREIGN KEY (fuel_snapshot_id)
            REFERENCES trip_fuel_snapshots(id);
        END IF;
      END $$;
    `);

    // ---------------------------------------------------------------------
    // 11. Seeds — pricing_parameters (policies)
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      INSERT INTO pricing_parameters (key, value, description, category)
      VALUES
        ('fuel_threshold_silent_pct', 0.03, 'Cambios <=3% aplican sin notificar', 'COMBUSTIBLE'),
        ('fuel_threshold_explicit_pct', 0.10, 'Cambios >10% requieren aprobación explícita', 'COMBUSTIBLE'),
        ('fuel_grace_window_minutes', 30, 'Ventana post-ASSIGNED sin ajustes', 'COMBUSTIBLE'),
        ('fuel_auto_apply_deadline_hours', 24, 'Ventana rechazo en AUTO_APPLIED INFORMATIVE', 'COMBUSTIBLE'),
        ('fuel_realtime_min_distance_km', 50, 'Viajes >= este valor nacen REALTIME', 'COMBUSTIBLE'),
        ('vehicle_fuel_change_approval_pct', 0.20, 'Cambio consumo vehicle >20% requiere re-aprobación admin', 'COMBUSTIBLE')
      ON CONFLICT (key) DO NOTHING
    `);

    // Seeds — consumos default por equipment type (ADR-007)
    await queryRunner.query(`
      INSERT INTO pricing_parameters (key, value, description, category)
      VALUES
        ('fuel_consumption_default_BITREN', 45, 'L/100km default bitren', 'COMBUSTIBLE'),
        ('fuel_consumption_default_SEMI_REMOLQUE', 35, 'L/100km default semi remolque', 'COMBUSTIBLE'),
        ('fuel_consumption_default_BATEA', 32, 'L/100km default batea', 'COMBUSTIBLE'),
        ('fuel_consumption_default_TOLVA', 32, 'L/100km default tolva', 'COMBUSTIBLE'),
        ('fuel_consumption_default_ESCALABLE', 30, 'L/100km default escalable', 'COMBUSTIBLE'),
        ('fuel_consumption_default_CARROZADO', 28, 'L/100km default carrozado', 'COMBUSTIBLE'),
        ('fuel_consumption_default_CAMION', 28, 'L/100km default camión', 'COMBUSTIBLE'),
        ('fuel_consumption_default_PLAYO', 26, 'L/100km default playo', 'COMBUSTIBLE'),
        ('fuel_consumption_default_BARANDA_FIJA', 24, 'L/100km default baranda fija', 'COMBUSTIBLE'),
        ('fuel_consumption_default_BARANDA_REBATIBLE', 24, 'L/100km default baranda rebatible', 'COMBUSTIBLE'),
        ('fuel_consumption_default_CISTERNA', 40, 'L/100km default cisterna', 'COMBUSTIBLE'),
        ('fuel_consumption_default_FURGON', 18, 'L/100km default furgón', 'COMBUSTIBLE'),
        ('fuel_consumption_default_CAMIONETA', 14, 'L/100km default camioneta', 'COMBUSTIBLE'),
        ('fuel_consumption_default_AUTO', 8, 'L/100km default auto', 'COMBUSTIBLE'),
        ('fuel_consumption_default_MOTO', 4, 'L/100km default moto', 'COMBUSTIBLE'),
        ('fuel_consumption_default_GLOBAL', 30, 'L/100km fallback global', 'COMBUSTIBLE')
      ON CONFLICT (key) DO NOTHING
    `);

    // ---------------------------------------------------------------------
    // 12. Seeds — feature_flags (todas OFF para deploy seguro)
    // ---------------------------------------------------------------------
    await queryRunner.query(`
      INSERT INTO feature_flags (key, value, description)
      VALUES
        ('FUEL_TRACKING_ENABLED', 'false'::jsonb, 'Master switch sistema completo'),
        ('FUEL_AUTO_APPLY_ENABLED', 'false'::jsonb, 'Política escalonada activa; si false todo es PROPOSED'),
        ('FUEL_ROLLOUT_PCT', '0'::jsonb, 'Porcentaje de dadores con feature activa (0-100)')
      ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse order of creation

    // Drop FK then column
    await queryRunner.query(`
      ALTER TABLE trips DROP CONSTRAINT IF EXISTS fk_trips_fuel_snapshot
    `);

    await queryRunner.query(`
      ALTER TABLE trips
        DROP COLUMN IF EXISTS actual_final_amount,
        DROP COLUMN IF EXISTS total_fuel_adjustment,
        DROP COLUMN IF EXISTS base_fuel_cost,
        DROP COLUMN IF EXISTS fuel_snapshot_id,
        DROP COLUMN IF EXISTS pricing_mode
    `);

    await queryRunner.query(`
      ALTER TABLE vehicles
        DROP COLUMN IF EXISTS fuel_type,
        DROP COLUMN IF EXISTS fuel_consumption
    `);

    // Remove seeds (only the ones we inserted; safe because ON CONFLICT DO NOTHING
    // means we didn't overwrite anything)
    await queryRunner.query(`
      DELETE FROM feature_flags WHERE key IN (
        'FUEL_TRACKING_ENABLED', 'FUEL_AUTO_APPLY_ENABLED', 'FUEL_ROLLOUT_PCT'
      )
    `);

    await queryRunner.query(`
      DELETE FROM pricing_parameters WHERE key LIKE 'fuel_%' OR key LIKE 'vehicle_fuel_%'
    `);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS fuel_adjustment_notifications`);
    await queryRunner.query(`DROP TABLE IF EXISTS feature_flags`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration_outbox`);
    await queryRunner.query(`DROP TABLE IF EXISTS trip_location_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS trip_fuel_adjustments`);
    await queryRunner.query(`DROP TABLE IF EXISTS trip_fuel_snapshots`);
    await queryRunner.query(`DROP TABLE IF EXISTS fuel_price_history`);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "pricing_mode_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "adjustment_policy_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "adjustment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fuel_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fuel_type_enum"`);
  }
}
