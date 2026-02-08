/**
 * Seed script para crear conductores de prueba
 * Uso: npx ts-node -r tsconfig-paths/register src/scripts/seed-drivers.ts
 *
 * Crea 5 conductores CHOFER verificados con coordenadas en zona sur
 * de Buenos Aires a distintas distancias del punto de prueba (-34.85, -58.52)
 */

import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const TEST_DRIVERS = [
  {
    email: 'chofer1@test.com',
    firstName: 'Carlos',
    lastName: 'Rodríguez',
    phone: '+5491111111111',
    // Lanús (~3km del punto de prueba)
    latitude: -34.8400,
    longitude: -58.5100,
    address: 'Lanús, Buenos Aires',
    dni: '30111111',
    cuit: '20301111119',
  },
  {
    email: 'chofer2@test.com',
    firstName: 'Miguel',
    lastName: 'Fernández',
    phone: '+5491122222222',
    // Lomas de Zamora (~8km)
    latitude: -34.7700,
    longitude: -58.4400,
    address: 'Lomas de Zamora, Buenos Aires',
    dni: '31222222',
    cuit: '20312222229',
  },
  {
    email: 'chofer3@test.com',
    firstName: 'Roberto',
    lastName: 'González',
    phone: '+5491133333333',
    // Avellaneda (~12km)
    latitude: -34.6600,
    longitude: -58.3650,
    address: 'Avellaneda, Buenos Aires',
    dni: '32333333',
    cuit: '20323333339',
  },
  {
    email: 'chofer4@test.com',
    firstName: 'Jorge',
    lastName: 'Martínez',
    phone: '+5491144444444',
    // Quilmes (~20km)
    latitude: -34.7200,
    longitude: -58.2600,
    address: 'Quilmes, Buenos Aires',
    dni: '33444444',
    cuit: '20334444449',
  },
  {
    email: 'chofer5@test.com',
    firstName: 'Alejandro',
    lastName: 'López',
    phone: '+5491155555555',
    // Ezeiza (~30km)
    latitude: -34.8550,
    longitude: -58.3200,
    address: 'Ezeiza, Buenos Aires',
    dni: '34555555',
    cuit: '20345555559',
  },
];

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;

  const dataSource = new DataSource({
    type: 'postgres',
    ...(databaseUrl
      ? { url: databaseUrl }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          username: process.env.DB_USERNAME || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          database: process.env.DB_DATABASE || 'cargaflow',
        }),
    ssl: databaseUrl ? { rejectUnauthorized: false } : false,
    entities: [],
  });

  await dataSource.initialize();
  console.log('Conectado a la base de datos');

  const hashedPassword = await bcrypt.hash('Test1234', 10);

  for (const driver of TEST_DRIVERS) {
    // Verificar si ya existe
    const existing = await dataSource.query(
      `SELECT id FROM users WHERE email = $1`,
      [driver.email],
    );

    if (existing.length > 0) {
      // Actualizar coordenadas y estado
      await dataSource.query(
        `UPDATE users SET
          latitude = $1, longitude = $2, address = $3,
          estado = 'VERIFIED', rol = 'CHOFER',
          first_name = $4, last_name = $5
        WHERE email = $6`,
        [driver.latitude, driver.longitude, driver.address, driver.firstName, driver.lastName, driver.email],
      );
      console.log(`  Actualizado: ${driver.firstName} ${driver.lastName} (${driver.email})`);
    } else {
      // Crear nuevo
      await dataSource.query(
        `INSERT INTO users (
          email, password, phone, first_name, last_name,
          rol, estado, latitude, longitude, address,
          dni, cuit, email_verified, phone_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, true)`,
        [
          driver.email, hashedPassword, driver.phone,
          driver.firstName, driver.lastName,
          'CHOFER', 'VERIFIED',
          driver.latitude, driver.longitude, driver.address,
          driver.dni, driver.cuit,
        ],
      );
      console.log(`  Creado: ${driver.firstName} ${driver.lastName} (${driver.email})`);
    }
  }

  // Mostrar resumen
  const drivers = await dataSource.query(
    `SELECT id, email, first_name, last_name, latitude, longitude, address, estado
     FROM users WHERE rol = 'CHOFER' AND estado = 'VERIFIED'
     ORDER BY email`,
  );

  console.log('\n=== Conductores de prueba disponibles ===');
  console.log('Password para todos: Test1234\n');
  drivers.forEach((d: any) => {
    console.log(`  ${d.first_name} ${d.last_name}`);
    console.log(`    Email: ${d.email}`);
    console.log(`    Ubicación: ${d.address} (${d.latitude}, ${d.longitude})`);
    console.log('');
  });

  await dataSource.destroy();
  console.log('Seed completado.');
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
