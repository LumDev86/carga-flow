/**
 * Seed inicial del precio de gasoil para activar el sistema de fuel tracking.
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register src/scripts/seed-initial-fuel-price.ts
 *
 * Qué hace:
 *   Inserta una fila en fuel_price_history por cada tipo de combustible
 *   (COMUN y PREMIUM) con el precio actual de YPF, usando el admin
 *   `admin@cargaflow.com` como creator. Idempotente: si ya existe un
 *   idempotency_key que coincide, no duplica.
 *
 * Precios del script: actualizar antes de correr si el valor cambió.
 * Fuente recomendada: surtidor YPF en Buenos Aires, cotización semanal.
 */

import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createHash } from 'crypto';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface SeedEntry {
  fuelType: 'COMUN' | 'PREMIUM';
  pricePerLiter: number;
  sourceRef: string;
  notes: string;
}

// TODO: Actualizar antes de correr con el precio real vigente
const ENTRIES: SeedEntry[] = [
  {
    fuelType: 'COMUN',
    pricePerLiter: 1950.0,
    sourceRef: 'YPF Bs.As. 2026-04-17',
    notes: 'Seed inicial del sistema de fuel tracking',
  },
  {
    fuelType: 'PREMIUM',
    pricePerLiter: 2120.0,
    sourceRef: 'YPF Bs.As. 2026-04-17',
    notes: 'Seed inicial del sistema de fuel tracking',
  },
];

const ADMIN_EMAIL = 'admin@cargaflow.com';

async function seed() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;

  const ds = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    ssl: { rejectUnauthorized: false },
    synchronize: false,
    logging: false,
  });

  await ds.initialize();

  try {
    const adminRow = await ds.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [ADMIN_EMAIL],
    );
    if (!adminRow.length) {
      throw new Error(`Admin ${ADMIN_EMAIL} not found. Run seed-admin first.`);
    }
    const adminId = adminRow[0].id;

    for (const entry of ENTRIES) {
      // Derive a deterministic idempotency key so repeated runs are no-ops
      const idempotencyKey = createHash('sha256')
        .update(
          `initial-seed-${entry.fuelType}-${entry.pricePerLiter}-${entry.sourceRef}`,
        )
        .digest('hex')
        .slice(0, 32);

      const existing = await ds.query(
        `SELECT id FROM fuel_price_history WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey],
      );
      if (existing.length) {
        console.log(
          `[skip] ${entry.fuelType} already seeded (id=${existing[0].id})`,
        );
        continue;
      }

      const [inserted] = await ds.query(
        `
        INSERT INTO fuel_price_history
          (fuel_type, price_per_liter, effective_from, source, source_ref,
           created_by, notes, idempotency_key)
        VALUES ($1, $2, NOW(), 'MANUAL_ADMIN', $3, $4, $5, $6)
        RETURNING id, fuel_type, price_per_liter, effective_from
        `,
        [
          entry.fuelType,
          entry.pricePerLiter.toFixed(2),
          entry.sourceRef,
          adminId,
          entry.notes,
          idempotencyKey,
        ],
      );

      console.log(
        `[seeded] ${inserted.fuel_type}: $${inserted.price_per_liter}/L from ${inserted.effective_from}`,
      );
    }

    console.log('\n✅ Done. Current fuel prices:');
    const currents = await ds.query(
      `
      SELECT DISTINCT ON (fuel_type)
        fuel_type, price_per_liter, effective_from, source_ref
      FROM fuel_price_history
      ORDER BY fuel_type, effective_from DESC
      `,
    );
    for (const row of currents) {
      console.log(
        `  ${row.fuel_type}: $${row.price_per_liter}/L (${row.source_ref})`,
      );
    }
  } finally {
    await ds.destroy();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
