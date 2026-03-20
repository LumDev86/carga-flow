import { AddPortIdToUsers1743000000000 } from './1743000000000-AddPortIdToUsers';
import { AddPortIdsToTrips1743100000000 } from './1743100000000-AddPortIdsToTrips';
import { BackfillTripPortIds1743200000000 } from './1743200000000-BackfillTripPortIds';

// Mock QueryRunner
function createMockQueryRunner() {
  const queries: string[] = [];
  return {
    query: jest.fn().mockImplementation((sql: string) => {
      queries.push(sql);
      return Promise.resolve();
    }),
    getQueries: () => queries,
  };
}

describe('Port Migrations', () => {
  describe('AddPortIdToUsers', () => {
    const migration = new AddPortIdToUsers1743000000000();

    it('should add port_id column, FK and index on up', async () => {
      const qr = createMockQueryRunner();
      await migration.up(qr as any);

      const queries = qr.getQueries();
      expect(queries).toHaveLength(3);
      expect(queries[0]).toContain('ADD COLUMN port_id UUID');
      expect(queries[1]).toContain('FOREIGN KEY (port_id) REFERENCES ports(id)');
      expect(queries[1]).toContain('ON DELETE SET NULL');
      expect(queries[2]).toContain('CREATE INDEX idx_users_port_id');
    });

    it('should drop index, FK and column on down', async () => {
      const qr = createMockQueryRunner();
      await migration.down(qr as any);

      const queries = qr.getQueries();
      expect(queries).toHaveLength(3);
      expect(queries[0]).toContain('DROP INDEX');
      expect(queries[1]).toContain('DROP CONSTRAINT');
      expect(queries[2]).toContain('DROP COLUMN');
    });
  });

  describe('AddPortIdsToTrips', () => {
    const migration = new AddPortIdsToTrips1743100000000();

    it('should add origin_port_id and destination_port_id columns, FKs and indexes on up', async () => {
      const qr = createMockQueryRunner();
      await migration.up(qr as any);

      const queries = qr.getQueries();
      expect(queries).toHaveLength(6);
      expect(queries[0]).toContain('ADD COLUMN origin_port_id UUID');
      expect(queries[1]).toContain('ADD COLUMN destination_port_id UUID');
      expect(queries[2]).toContain('fk_trips_origin_port_id');
      expect(queries[3]).toContain('fk_trips_destination_port_id');
      expect(queries[4]).toContain('idx_trips_origin_port_id');
      expect(queries[5]).toContain('idx_trips_destination_port_id');
    });

    it('should drop indexes, FKs and columns on down', async () => {
      const qr = createMockQueryRunner();
      await migration.down(qr as any);

      const queries = qr.getQueries();
      expect(queries).toHaveLength(6);
      // Drop in reverse order: indexes, FKs, columns
      expect(queries[0]).toContain('DROP INDEX');
      expect(queries[1]).toContain('DROP INDEX');
      expect(queries[2]).toContain('DROP CONSTRAINT');
      expect(queries[3]).toContain('DROP CONSTRAINT');
      expect(queries[4]).toContain('DROP COLUMN');
      expect(queries[5]).toContain('DROP COLUMN');
    });
  });

  describe('BackfillTripPortIds', () => {
    const migration = new BackfillTripPortIds1743200000000();

    it('should run backfill queries on up', async () => {
      const qr = createMockQueryRunner();
      await migration.up(qr as any);

      const queries = qr.getQueries();
      expect(queries).toHaveLength(2);
      // Both queries use Haversine formula
      expect(queries[0]).toContain('origin_port_id');
      expect(queries[0]).toContain('ASIN');
      expect(queries[0]).toContain('0.5'); // 500m radius
      expect(queries[1]).toContain('destination_port_id');
      expect(queries[1]).toContain('ASIN');
    });

    it('should reset all port IDs to null on down', async () => {
      const qr = createMockQueryRunner();
      await migration.down(qr as any);

      const queries = qr.getQueries();
      expect(queries).toHaveLength(1);
      expect(queries[0]).toContain('SET origin_port_id = NULL, destination_port_id = NULL');
    });
  });

  describe('Migration reversibility', () => {
    it('all migrations should have both up and down methods', () => {
      const migrations = [
        new AddPortIdToUsers1743000000000(),
        new AddPortIdsToTrips1743100000000(),
        new BackfillTripPortIds1743200000000(),
      ];

      for (const migration of migrations) {
        expect(typeof migration.up).toBe('function');
        expect(typeof migration.down).toBe('function');
      }
    });
  });
});
