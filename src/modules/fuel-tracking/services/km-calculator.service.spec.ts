import { KmCalculatorService } from './km-calculator.service';
import type { Repository } from 'typeorm';
import type { TripLocationHistory } from '../entities/trip-location-history.entity';

function makeRepo(points: Partial<TripLocationHistory>[]) {
  return {
    find: jest.fn(async () => points),
  } as unknown as Repository<TripLocationHistory>;
}

function p(
  lat: number,
  lng: number,
  recordedAt: Date,
  extras: Partial<TripLocationHistory> = {},
): Partial<TripLocationHistory> {
  return {
    latitude: String(lat),
    longitude: String(lng),
    recordedAt,
    speedKmh: null,
    accuracyM: null,
    ...extras,
  };
}

describe('KmCalculatorService', () => {
  describe('haversine', () => {
    it('returns 0 for the same point', () => {
      const svc = new KmCalculatorService(makeRepo([]));
      const d = svc.haversine(
        { latitude: -32.482, longitude: -58.233 },
        { latitude: -32.482, longitude: -58.233 },
      );
      expect(d).toBeCloseTo(0);
    });

    it('matches the known Buenos Aires → Rosario distance (~280 km)', () => {
      const svc = new KmCalculatorService(makeRepo([]));
      const d = svc.haversine(
        { latitude: -34.6037, longitude: -58.3816 }, // BsAs
        { latitude: -32.9442, longitude: -60.6505 }, // Rosario
      );
      // Real: ~280 km
      expect(d).toBeGreaterThan(275);
      expect(d).toBeLessThan(290);
    });
  });

  describe('calcKmTraveled', () => {
    const now = new Date('2026-04-17T14:00:00Z');

    it('returns 0 and unavailable when no points', async () => {
      const svc = new KmCalculatorService(makeRepo([]));
      const r = await svc.calcKmTraveled('trip-1');
      expect(r.kmTraveled).toBe(0);
      expect(r.source).toBe('unavailable');
    });

    it('uses haversine_linear when only one point and fallback origin given', async () => {
      const svc = new KmCalculatorService(
        makeRepo([p(-32.9, -60.6, now)]),
      );
      const r = await svc.calcKmTraveled('trip-1', {
        latitude: -34.6,
        longitude: -58.38,
      });
      expect(r.source).toBe('haversine_linear');
      expect(r.kmTraveled).toBeGreaterThan(200);
    });

    it('integrates Haversine over multiple valid points', async () => {
      const points = [
        p(-34.6037, -58.3816, now),
        p(-33.7737, -59.5616, new Date(now.getTime() + 2 * 3600 * 1000)),
        p(-32.9442, -60.6505, new Date(now.getTime() + 4 * 3600 * 1000)),
      ];
      const svc = new KmCalculatorService(makeRepo(points));
      const r = await svc.calcKmTraveled('trip-1');
      expect(r.source).toBe('gps_tracklog');
      expect(r.pointsUsed).toBe(3);
      // Integrated distance should be close to BsAs-Rosario direct ~280km
      expect(r.kmTraveled).toBeGreaterThan(270);
      expect(r.kmTraveled).toBeLessThan(310);
    });

    it('filters out low-accuracy points', async () => {
      // 1 minute apart, ~0.6km (~36 km/h → plausible)
      const points = [
        p(-34.6000, -58.3800, new Date(now.getTime() + 0), { accuracyM: '200' }), // rejected
        p(-34.6050, -58.3850, new Date(now.getTime() + 60_000)),
        p(-34.6100, -58.3900, new Date(now.getTime() + 120_000)),
      ];
      const svc = new KmCalculatorService(makeRepo(points));
      const r = await svc.calcKmTraveled('trip-1');
      expect(r.pointsUsed).toBe(2);
    });

    it('filters out points with impossible individual speed', async () => {
      const points = [
        p(-34.6000, -58.3800, new Date(now.getTime() + 0)),
        // speed reported by device = 300 km/h (impossible) → rejected individually
        p(-34.6050, -58.3850, new Date(now.getTime() + 60_000), { speedKmh: '300' }),
        p(-34.6100, -58.3900, new Date(now.getTime() + 120_000)),
      ];
      const svc = new KmCalculatorService(makeRepo(points));
      const r = await svc.calcKmTraveled('trip-1');
      expect(r.pointsUsed).toBe(2);
    });

    it('filters out teleport points (big gap in distance with small gap in time)', async () => {
      const points = [
        p(-34.6, -58.38, new Date(now.getTime() + 0)),
        // Big jump: 600km away, only 10 min later — teleport = GPS error
        p(-32.9, -60.65, new Date(now.getTime() + 10 * 60 * 1000)),
      ];
      const svc = new KmCalculatorService(makeRepo(points));
      const r = await svc.calcKmTraveled('trip-1');
      // Only first point accepted; 1 remaining + no fallback = unavailable
      expect(r.source).toBe('unavailable');
    });
  });
});
