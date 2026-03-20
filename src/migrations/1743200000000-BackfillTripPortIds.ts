import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillTripPortIds1743200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backfill origin_port_id: find nearest active port within 500m of trip origin
    await queryRunner.query(`
      UPDATE trips t
      SET origin_port_id = closest.port_id
      FROM (
        SELECT DISTINCT ON (t2.id) t2.id AS trip_id, p.id AS port_id
        FROM trips t2
        CROSS JOIN ports p
        WHERE p.is_active = true
          AND t2.origin_port_id IS NULL
          AND (
            6371 * 2 * ASIN(SQRT(
              POWER(SIN(RADIANS(CAST(p.latitude AS float) - CAST(t2.origin_lat AS float)) / 2), 2) +
              COS(RADIANS(CAST(t2.origin_lat AS float))) * COS(RADIANS(CAST(p.latitude AS float))) *
              POWER(SIN(RADIANS(CAST(p.longitude AS float) - CAST(t2.origin_lng AS float)) / 2), 2)
            ))
          ) < 0.5
        ORDER BY t2.id, (
          6371 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(CAST(p.latitude AS float) - CAST(t2.origin_lat AS float)) / 2), 2) +
            COS(RADIANS(CAST(t2.origin_lat AS float))) * COS(RADIANS(CAST(p.latitude AS float))) *
            POWER(SIN(RADIANS(CAST(p.longitude AS float) - CAST(t2.origin_lng AS float)) / 2), 2)
          ))
        ) ASC
      ) closest
      WHERE t.id = closest.trip_id
    `);

    // Backfill destination_port_id: find nearest active port within 500m of trip destination
    await queryRunner.query(`
      UPDATE trips t
      SET destination_port_id = closest.port_id
      FROM (
        SELECT DISTINCT ON (t2.id) t2.id AS trip_id, p.id AS port_id
        FROM trips t2
        CROSS JOIN ports p
        WHERE p.is_active = true
          AND t2.destination_port_id IS NULL
          AND (
            6371 * 2 * ASIN(SQRT(
              POWER(SIN(RADIANS(CAST(p.latitude AS float) - CAST(t2.destination_lat AS float)) / 2), 2) +
              COS(RADIANS(CAST(t2.destination_lat AS float))) * COS(RADIANS(CAST(p.latitude AS float))) *
              POWER(SIN(RADIANS(CAST(p.longitude AS float) - CAST(t2.destination_lng AS float)) / 2), 2)
            ))
          ) < 0.5
        ORDER BY t2.id, (
          6371 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(CAST(p.latitude AS float) - CAST(t2.destination_lat AS float)) / 2), 2) +
            COS(RADIANS(CAST(t2.destination_lat AS float))) * COS(RADIANS(CAST(p.latitude AS float))) *
            POWER(SIN(RADIANS(CAST(p.longitude AS float) - CAST(t2.destination_lng AS float)) / 2), 2)
          ))
        ) ASC
      ) closest
      WHERE t.id = closest.trip_id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert backfill - set all to null
    await queryRunner.query(`UPDATE trips SET origin_port_id = NULL, destination_port_id = NULL`);
  }
}
