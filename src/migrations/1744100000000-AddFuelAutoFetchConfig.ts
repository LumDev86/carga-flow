import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the feature flag + configurable parameters for the fuel auto-fetch
 * cron (FASE 7).
 *
 * Note: pricing_parameters.value is numeric(12,4) and can't store strings,
 * so string configs (brand, province) live in feature_flags.value (jsonb).
 * Numeric thresholds live in pricing_parameters.
 */
export class AddFuelAutoFetchConfig1744100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO feature_flags (key, value, description)
      VALUES
        ('FUEL_AUTO_FETCH_ENABLED', 'false'::jsonb,
          'Habilita el cron diario que importa precios desde datos.energia.gob.ar'),
        ('FUEL_AUTOFETCH_BRAND', '"YPF"'::jsonb,
          'Marca comercial de referencia para auto-fetch (bandera del surtidor)'),
        ('FUEL_AUTOFETCH_PROVINCE', '"BUENOS AIRES"'::jsonb,
          'Provincia de referencia para auto-fetch')
      ON CONFLICT (key) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO pricing_parameters (key, value, description, category)
      VALUES
        ('fuel_autofetch_freshness_days', 30,
          'Ventana máx en días para considerar precios del dataset como vigentes',
          'COMBUSTIBLE'),
        ('fuel_autofetch_min_pct_change', 0.005,
          'Threshold mínimo de cambio para registrar auto-fetch (evita ruido)',
          'COMBUSTIBLE')
      ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM feature_flags WHERE key IN (
        'FUEL_AUTO_FETCH_ENABLED',
        'FUEL_AUTOFETCH_BRAND',
        'FUEL_AUTOFETCH_PROVINCE'
      )`,
    );
    await queryRunner.query(
      `DELETE FROM pricing_parameters WHERE key IN (
        'fuel_autofetch_freshness_days',
        'fuel_autofetch_min_pct_change'
      )`,
    );
  }
}
