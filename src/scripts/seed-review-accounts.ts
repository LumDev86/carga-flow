/**
 * Seed script para crear cuentas de revisión de App Store
 * Uso: npx ts-node -r tsconfig-paths/register src/scripts/seed-review-accounts.ts
 */

import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const REVIEW_ACCOUNTS = [
  {
    email: 'review@cargaflow.com',
    password: 'Review2026!',
    firstName: 'App',
    lastName: 'Review',
    phone: '+5491100000001',
    rol: 'SOLICITANTE',
    description: 'Dador de Carga (cuenta principal de review)',
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

  for (const account of REVIEW_ACCOUNTS) {
    const hashedPassword = await bcrypt.hash(account.password, 10);

    const existing = await dataSource.query(
      `SELECT id FROM users WHERE email = $1`,
      [account.email],
    );

    if (existing.length > 0) {
      await dataSource.query(
        `UPDATE users SET
          password = $1, rol = $2, estado = 'VERIFIED',
          first_name = $3, last_name = $4,
          email_verified = true, phone_verified = true
        WHERE email = $5`,
        [hashedPassword, account.rol, account.firstName, account.lastName, account.email],
      );
      console.log(`  Actualizado: ${account.email} (${account.description})`);
    } else {
      await dataSource.query(
        `INSERT INTO users (
          email, password, phone, first_name, last_name,
          rol, estado, email_verified, phone_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, 'VERIFIED', true, true)`,
        [
          account.email,
          hashedPassword,
          account.phone,
          account.firstName,
          account.lastName,
          account.rol,
        ],
      );
      console.log(`  Creado: ${account.email} (${account.description})`);
    }
  }

  console.log('\n=== Cuentas de Review para App Store ===');
  for (const account of REVIEW_ACCOUNTS) {
    console.log(`  ${account.description}:`);
    console.log(`    Email:    ${account.email}`);
    console.log(`    Password: ${account.password}`);
    console.log(`    Rol:      ${account.rol}`);
  }
  console.log('');

  await dataSource.destroy();
  console.log('Seed completado.');
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
