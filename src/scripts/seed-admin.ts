/**
 * Seed script para crear usuario administrador
 * Uso: npx ts-node -r tsconfig-paths/register src/scripts/seed-admin.ts
 */

import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const ADMIN_USER = {
  email: 'admin@cargaflow.com',
  password: 'Admin1234',
  firstName: 'Admin',
  lastName: 'CargaFlow',
  phone: '+5491100000000',
};

async function seed() {
  // Usar DATABASE_URL reemplazando host directo por pooler (el directo no siempre resuelve)
  const databaseUrl = (process.env.DATABASE_URL || '').replace(
    'db.cpbkjablnqyedvqucmoh.supabase.co',
    process.env.DB_HOST || 'aws-0-us-west-2.pooler.supabase.com',
  );
  // El pooler requiere el username con project ref
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
  console.log('Conectado a la base de datos');

  const hashedPassword = await bcrypt.hash(ADMIN_USER.password, 10);

  const existing = await dataSource.query(
    `SELECT id FROM users WHERE email = $1`,
    [ADMIN_USER.email],
  );

  if (existing.length > 0) {
    await dataSource.query(
      `UPDATE users SET
        rol = 'ADMIN', estado = 'VERIFIED',
        first_name = $1, last_name = $2,
        email_verified = true, phone_verified = true
      WHERE email = $3`,
      [ADMIN_USER.firstName, ADMIN_USER.lastName, ADMIN_USER.email],
    );
    console.log(`  Actualizado: ${ADMIN_USER.email} -> rol ADMIN`);
  } else {
    await dataSource.query(
      `INSERT INTO users (
        email, password, phone, first_name, last_name,
        rol, estado, email_verified, phone_verified
      ) VALUES ($1, $2, $3, $4, $5, 'ADMIN', 'VERIFIED', true, true)`,
      [
        ADMIN_USER.email,
        hashedPassword,
        ADMIN_USER.phone,
        ADMIN_USER.firstName,
        ADMIN_USER.lastName,
      ],
    );
    console.log(`  Creado: ${ADMIN_USER.email}`);
  }

  console.log('\n=== Usuario Admin ===');
  console.log(`  Email:    ${ADMIN_USER.email}`);
  console.log(`  Password: ${ADMIN_USER.password}`);
  console.log('');

  await dataSource.destroy();
  console.log('Seed completado.');
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
