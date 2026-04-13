/**
 * Seed script para crear usuarios de review (Google Play / App Store)
 * Uso local: npx ts-node -r tsconfig-paths/register src/scripts/seed-review-users.ts
 * Uso en container:
 *   docker cp src/scripts/seed-review-users.ts carga-flow-api:/app/seed-review-users.ts
 *   docker exec -w /app carga-flow-api node_modules/.bin/ts-node seed-review-users.ts
 */

import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

const PASSWORD = 'Review2026!';

const REVIEW_USERS = [
  {
    email: 'review@cargaflow.com',
    firstName: 'Review',
    lastName: 'Dador',
    phone: '+5491100000001',
    rol: 'SOLICITANTE',
  },
  {
    email: 'review.dador@cargaflow.com',
    firstName: 'Review',
    lastName: 'Dador',
    phone: '+5491100000002',
    rol: 'SOLICITANTE',
  },
  {
    email: 'review.productor@cargaflow.com',
    firstName: 'Review',
    lastName: 'Productor',
    phone: '+5491100000003',
    rol: 'PRODUCTOR',
  },
  {
    email: 'review.transportista@cargaflow.com',
    firstName: 'Review',
    lastName: 'Transportista',
    phone: '+5491100000004',
    rol: 'CHOFER',
  },
];

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL no está definida en el entorno.');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    ssl: { rejectUnauthorized: false },
    entities: [],
  });

  await dataSource.initialize();
  console.log('Conectado a la base de datos');

  const hashedPassword = await bcrypt.hash(PASSWORD, 10);

  for (const user of REVIEW_USERS) {
    const existing = await dataSource.query(
      `SELECT id FROM users WHERE email = $1`,
      [user.email],
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
          has_accepted_declaration = true,
          declaration_accepted_at = NOW()
        WHERE email = $6`,
        [
          hashedPassword,
          user.rol,
          user.firstName,
          user.lastName,
          user.phone,
          user.email,
        ],
      );
      console.log(`  Actualizado: ${user.email} -> rol ${user.rol}`);
    } else {
      await dataSource.query(
        `INSERT INTO users (
          email, password, phone, first_name, last_name,
          rol, estado, email_verified, phone_verified,
          has_accepted_declaration, declaration_accepted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'VERIFIED', true, true, true, NOW())`,
        [
          user.email,
          hashedPassword,
          user.phone,
          user.firstName,
          user.lastName,
          user.rol,
        ],
      );
      console.log(`  Creado: ${user.email} -> rol ${user.rol}`);
    }
  }

  console.log('\n=== Usuarios de Review ===');
  console.log(`  Password (todos): ${PASSWORD}`);
  for (const u of REVIEW_USERS) {
    console.log(`  - ${u.email.padEnd(38)} (${u.rol})`);
  }
  console.log('');

  await dataSource.destroy();
  console.log('Seed completado.');
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
