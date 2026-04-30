/**
 * Seed script para crear cuentas de revisión de App Store / Play Store.
 * Uso: docker exec carga-flow-api npx ts-node -r tsconfig-paths/register src/scripts/seed-review-accounts.ts
 *
 * Cubre los 5 roles que Apple pide ver ("all the different role accounts"):
 *  SOLICITANTE, CHOFER, PRODUCTOR, PUERTO, ADMIN.
 *
 * Importante: la cuenta SOLICITANTE recibe `cuit_verified_at = NOW()` y
 * `completed_trips_as_requester = 10` para que los rate-limits anti-spam
 * (enforceNewAccountTripLimits) NO bloqueen al revisor de Apple cuando
 * intente crear un trip.
 */

import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface ReviewAccount {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  rol: 'SOLICITANTE' | 'CHOFER' | 'PRODUCTOR' | 'PUERTO' | 'ADMIN';
  description: string;
  /** Si rol === 'PUERTO', requerimos un port_id real */
  portName?: string;
  /** Para SOLICITANTE/PRODUCTOR: marcar como verificado para saltarse rate-limits */
  trustedDador?: boolean;
}

const REVIEW_ACCOUNTS: ReviewAccount[] = [
  {
    email: 'review@cargaflow.com',
    password: 'Review2026!',
    firstName: 'App',
    lastName: 'Review',
    phone: '+5491100000001',
    rol: 'SOLICITANTE',
    description: 'Dador de Carga (cuenta principal de review)',
    trustedDador: true,
  },
  {
    email: 'review-transportista@cargaflow.com',
    password: 'Review2026!',
    firstName: 'Review',
    lastName: 'Transportista',
    phone: '+5491100000002',
    rol: 'CHOFER',
    description: 'Transportista',
  },
  {
    email: 'review-productor@cargaflow.com',
    password: 'Review2026!',
    firstName: 'Review',
    lastName: 'Productor',
    phone: '+5491100000003',
    rol: 'PRODUCTOR',
    description: 'Productor',
    trustedDador: true,
  },
  {
    email: 'review-puerto@cargaflow.com',
    password: 'Review2026!',
    firstName: 'Review',
    lastName: 'Puerto',
    phone: '+5491100000004',
    rol: 'PUERTO',
    description: 'Operador de Puerto',
    portName: 'AGD - Timbúes',
  },
  {
    email: 'review-admin@cargaflow.com',
    password: 'Review2026!',
    firstName: 'Review',
    lastName: 'Admin',
    phone: '+5491100000005',
    rol: 'ADMIN',
    description: 'Administrador del CRM',
  },
];

async function seed() {
  const databaseUrl = (process.env.DATABASE_URL || '').replace(
    'db.cpbkjablnqyedvqucmoh.supabase.co',
    process.env.DB_HOST || 'aws-0-us-west-2.pooler.supabase.com',
  );
  const poolerUrl = databaseUrl.replace(
    'postgresql://postgres:',
    `postgresql://${process.env.DB_USERNAME || 'postgres'}:`,
  );

  const dataSource = new DataSource({
    type: 'postgres',
    url: poolerUrl,
    ssl: { rejectUnauthorized: false },
    entities: [],
  });

  await dataSource.initialize();
  console.log('Conectado a la base de datos\n');

  // 1) Resolver portId del PUERTO de review (debe existir activo)
  let reviewPortId: string | null = null;
  const puertoAccount = REVIEW_ACCOUNTS.find((a) => a.rol === 'PUERTO');
  if (puertoAccount?.portName) {
    const ports = await dataSource.query(
      `SELECT id FROM ports WHERE name = $1 AND is_active = true LIMIT 1`,
      [puertoAccount.portName],
    );
    if (ports.length === 0) {
      const fallback = await dataSource.query(
        `SELECT id, name FROM ports WHERE is_active = true ORDER BY created_at ASC LIMIT 1`,
      );
      if (fallback.length === 0) {
        throw new Error('No hay puertos activos en la DB para asignar al review-puerto');
      }
      reviewPortId = fallback[0].id;
      console.log(`  ⚠️  Puerto "${puertoAccount.portName}" no encontrado, uso fallback: ${fallback[0].name} (${reviewPortId})`);
    } else {
      reviewPortId = ports[0].id;
      console.log(`  Puerto resuelto: ${puertoAccount.portName} (${reviewPortId})`);
    }
  }

  for (const account of REVIEW_ACCOUNTS) {
    const hashedPassword = await bcrypt.hash(account.password, 10);
    const portIdForAccount = account.rol === 'PUERTO' ? reviewPortId : null;

    const existing = await dataSource.query(
      `SELECT id FROM users WHERE email = $1`,
      [account.email],
    );

    if (existing.length > 0) {
      await dataSource.query(
        `UPDATE users SET
          password = $1,
          rol = $2,
          estado = 'VERIFIED',
          first_name = $3,
          last_name = $4,
          phone = $5,
          email_verified = true,
          phone_verified = true,
          port_id = $6
        WHERE email = $7`,
        [
          hashedPassword,
          account.rol,
          account.firstName,
          account.lastName,
          account.phone,
          portIdForAccount,
          account.email,
        ],
      );
      console.log(`  Actualizado: ${account.email} (${account.description})`);
    } else {
      await dataSource.query(
        `INSERT INTO users (
          email, password, phone, first_name, last_name,
          rol, estado, email_verified, phone_verified, port_id
        ) VALUES ($1, $2, $3, $4, $5, $6, 'VERIFIED', true, true, $7)`,
        [
          account.email,
          hashedPassword,
          account.phone,
          account.firstName,
          account.lastName,
          account.rol,
          portIdForAccount,
        ],
      );
      console.log(`  Creado: ${account.email} (${account.description})`);
    }

    // Saltarse rate-limits anti-spam para SOLICITANTE/PRODUCTOR.
    // Las columnas cuit_verified_at y completed_trips_as_requester las creó
    // la migration AddCuitValidationToUsers; ignoramos el error si todavía
    // no se aplicó la migration.
    if (account.trustedDador) {
      try {
        await dataSource.query(
          `UPDATE users SET
            cuit_verified_at = COALESCE(cuit_verified_at, NOW()),
            completed_trips_as_requester = GREATEST(completed_trips_as_requester, 10)
          WHERE email = $1`,
          [account.email],
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(
          `  (⚠️ no se pudieron setear flags de trust para ${account.email}: ${msg})`,
        );
      }
    }
  }

  console.log('\n=== Cuentas de Review para App Store ===');
  for (const account of REVIEW_ACCOUNTS) {
    console.log(`  ${account.description}:`);
    console.log(`    Email:    ${account.email}`);
    console.log(`    Password: ${account.password}`);
    console.log(`    Rol:      ${account.rol}`);
    if (account.rol === 'PUERTO') {
      console.log(`    Puerto:   ${account.portName} (${reviewPortId})`);
    }
  }
  console.log('');

  await dataSource.destroy();
  console.log('Seed completado.');
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
