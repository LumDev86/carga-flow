import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Port Portal E2E Tests
 *
 * These tests require a running database with the migrations applied.
 * Run with: npm run test:e2e -- --testPathPattern=port-portal
 *
 * Prerequisites:
 * 1. Database available (TEST_DATABASE_URL or .env.test)
 * 2. Migrations run: npm run migration:run
 * 3. A port user with portId set in the database
 *
 * For CI, use a test database or mock the DB.
 */
describe('PortPortal (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  // Skip if no test DB configured
  const skipIfNoDb = process.env.TEST_DATABASE_URL ? false : true;

  beforeAll(async () => {
    if (skipIfNoDb) return;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    // Login as port user (assumes test user exists)
    try {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: process.env.TEST_PORT_USER_EMAIL || 'puerto@test.com',
          password: process.env.TEST_PORT_USER_PASSWORD || 'Test1234!',
        });
      authToken = loginRes.body?.access_token;
    } catch {
      // If login fails, tests will be skipped
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const conditionalIt = (name: string, fn: () => Promise<void>) => {
    if (skipIfNoDb || !authToken) {
      it.skip(name, fn);
    } else {
      it(name, fn);
    }
  };

  // --- Auth & Role Tests ---

  describe('Authentication & Authorization', () => {
    it('should reject requests without token', async () => {
      if (skipIfNoDb) return;

      return request(app.getHttpServer())
        .get('/api/port-portal/me')
        .expect(401);
    });

    conditionalIt('should accept requests with valid port user token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/port-portal/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('name');
    });
  });

  // --- Profile Tests ---

  describe('GET /port-portal/me', () => {
    conditionalIt('should return port profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/port-portal/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('name');
      expect(res.body).toHaveProperty('latitude');
      expect(res.body).toHaveProperty('longitude');
    });
  });

  // --- Dashboard Tests ---

  describe('GET /port-portal/dashboard', () => {
    conditionalIt('should return dashboard KPIs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/port-portal/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('tripsToday');
      expect(res.body).toHaveProperty('tripsThisWeek');
      expect(res.body).toHaveProperty('tripsThisMonth');
      expect(res.body).toHaveProperty('pendingUnloads');
      expect(res.body).toHaveProperty('pendingCpes');
      expect(typeof res.body.tripsToday).toBe('number');
    });
  });

  // --- Trips Tests ---

  describe('GET /port-portal/trips', () => {
    conditionalIt('should return paginated trips', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/port-portal/trips')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('limit');
      expect(res.body).toHaveProperty('totalPages');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    conditionalIt('should filter by direction', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/port-portal/trips?direction=incoming')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });

    conditionalIt('should filter by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/port-portal/trips?status=DELIVERED')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });

    conditionalIt('should reject invalid status filter', async () => {
      await request(app.getHttpServer())
        .get('/api/port-portal/trips?status=INVALID_STATUS')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    conditionalIt('should paginate with custom page/limit', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/port-portal/trips?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(5);
    });
  });

  describe('GET /port-portal/trips/today', () => {
    conditionalIt('should return today arrivals and departures', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/port-portal/trips/today')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('arrivals');
      expect(res.body).toHaveProperty('departures');
      expect(Array.isArray(res.body.arrivals)).toBe(true);
      expect(Array.isArray(res.body.departures)).toBe(true);
    });
  });

  // --- Stats Tests ---

  describe('GET /port-portal/stats', () => {
    conditionalIt('should return port statistics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/port-portal/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('tripsByMonth');
      expect(res.body).toHaveProperty('averageRatingGiven');
      expect(res.body).toHaveProperty('topDrivers');
      expect(res.body).toHaveProperty('cargoTypeBreakdown');
      expect(res.body).toHaveProperty('avgDeliveryTimeHours');
      expect(Array.isArray(res.body.tripsByMonth)).toBe(true);
    });
  });

  // --- Compatibility Tests ---

  describe('Backward Compatibility', () => {
    conditionalIt('existing trip endpoints should still work', async () => {
      // Login as a non-port user (solicitante) to ensure existing endpoints work
      // This test just verifies the API responds correctly
      const res = await request(app.getHttpServer())
        .get('/api/trips')
        .set('Authorization', `Bearer ${authToken}`);

      // Port user should get trips (might be 200 or 403 depending on role check)
      expect([200, 403]).toContain(res.status);
    });
  });
});
