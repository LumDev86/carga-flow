import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriverScore, DriverScoreStatus } from './entities/driver-score.entity';
import { User } from '../users/entities/user.entity';
import { Trip } from '../trips/entities/trip.entity';
import { TripIncident } from '../trips/entities/trip-incident.entity';
import { UserRole } from '../../shared/enums/user-role.enum';
import { UserStatus } from '../../shared/enums/user-status.enum';
import { TripStatus } from '../../shared/enums/trip-status.enum';
import { CargoType } from '../../shared/enums/cargo-type.enum';
import { EquipmentType } from '../../shared/enums/equipment-type.enum';
import { VehicleStatus } from '../../shared/enums/vehicle-status.enum';

// Mapa de compatibilidad carga → equipo (replicado de trips.service)
const CARGO_EQUIPMENT_MAP: Record<CargoType, EquipmentType[] | null> = {
  [CargoType.GRANOS_DERIVADOS]: [EquipmentType.TOLVA, EquipmentType.CISTERNA, EquipmentType.BATEA, EquipmentType.ESCALABLE, EquipmentType.BITREN],
  [CargoType.PALES]: [EquipmentType.BARANDA_REBATIBLE, EquipmentType.FURGON, EquipmentType.PLAYO, EquipmentType.CARROZADO],
  [CargoType.GRANEL]: [EquipmentType.TOLVA, EquipmentType.CISTERNA, EquipmentType.BARANDA_REBATIBLE],
  [CargoType.CARGA_GENERAL]: null,
};

// Pesos del scoring
const SCORE_WEIGHTS = {
  PROXIMITY: 0.40,
  REPUTATION: 0.25,
  ACCEPTANCE: 0.20,
  RETURN_BONUS: 0.15,
};

// Radio máximo de búsqueda para asignación inteligente (km)
const MAX_SEARCH_RADIUS_KM = 150;

export interface RankedDriver {
  driverId: string;
  driverName: string;
  distanceKm: number;
  proximityScore: number;
  reputationScore: number;
  acceptanceScore: number;
  returnBonus: number;
  totalScore: number;
  isPortReturn: boolean;
  lastDeliveryPortId: string | null;
}

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    @InjectRepository(DriverScore)
    private readonly driverScoreRepository: Repository<DriverScore>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(TripIncident)
    private readonly incidentRepository: Repository<TripIncident>,
  ) {}

  // ==========================================
  // HAVERSINE
  // ==========================================

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    // Clamp to prevent NaN from floating point exceeding 1.0
    const c = 2 * Math.atan2(Math.sqrt(Math.min(a, 1)), Math.sqrt(Math.max(1 - a, 0)));
    return Math.round(R * c * 100) / 100;
  }

  // ==========================================
  // RANKING DE DRIVERS
  // ==========================================

  /**
   * Calcula ranking de drivers para un trip.
   * Retorna lista ordenada por score descendente.
   */
  async calculateRanking(tripId: string): Promise<RankedDriver[]> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['destinationPort'],
    });
    if (!trip) {
      throw new NotFoundException(`Trip '${tripId}' no encontrado`);
    }

    // 1. Buscar drivers elegibles
    const eligibleDrivers = await this.findEligibleDrivers(
      trip.cargoType,
      MAX_SEARCH_RADIUS_KM,
      trip.originLat,
      trip.originLng,
    );

    if (eligibleDrivers.length === 0) {
      this.logger.log(`No hay drivers elegibles para trip ${tripId}`);
      return [];
    }

    // 2. Obtener scores de todos los drivers
    const driverIds = eligibleDrivers.map((d) => d.id);
    const scores = await this.getOrCreateScores(driverIds);
    const scoreMap = new Map(scores.map((s) => [s.driverId, s]));

    // 3. Buscar último viaje de cada driver (para detectar retorno puerto)
    const lastTrips = await this.getLastDeliveredTrips(driverIds);
    const lastTripMap = new Map(lastTrips.map((t) => [t.driverId, t]));

    // 4. Calcular score para cada driver
    const ranked: RankedDriver[] = [];

    for (const driver of eligibleDrivers) {
      const distanceKm = this.haversineKm(
        Number(trip.originLat),
        Number(trip.originLng),
        Number(driver.latitude),
        Number(driver.longitude),
      );

      // Score de proximidad: 5 si está a 0km, 0 si está a MAX_SEARCH_RADIUS_KM
      const proximityScore = Math.max(0, 5 * (1 - distanceKm / MAX_SEARCH_RADIUS_KM));

      // Score de reputación: weighted_score del driver (ya es 0-5)
      const driverScore = scoreMap.get(driver.id);
      const reputationScore = driverScore ? Number(driverScore.weightedScore) : 3.0;

      // Score de aceptación: acceptance_rate * 5
      const acceptanceScore = driverScore ? Number(driverScore.acceptanceRate) * 5 : 3.0;

      // Bonus retorno: si el driver acaba de descargar en un puerto cercano al origen del trip
      let returnBonus = 0;
      let isPortReturn = false;
      let lastDeliveryPortId: string | null = null;

      const lastTrip = lastTripMap.get(driver.id);
      if (lastTrip && lastTrip.destinationPortId) {
        lastDeliveryPortId = lastTrip.destinationPortId;
        // Si el último viaje terminó en un puerto y el driver sigue cerca de ese puerto
        const hoursSinceDelivery = lastTrip.deliveredAt
          ? (Date.now() - new Date(lastTrip.deliveredAt).getTime()) / (1000 * 60 * 60)
          : 999;

        if (hoursSinceDelivery <= 24) {
          // Driver descargó en puerto en las últimas 24hs → bonus
          returnBonus = 5;
          isPortReturn = true;
        }
      }

      const totalScore =
        SCORE_WEIGHTS.PROXIMITY * proximityScore +
        SCORE_WEIGHTS.REPUTATION * reputationScore +
        SCORE_WEIGHTS.ACCEPTANCE * acceptanceScore +
        SCORE_WEIGHTS.RETURN_BONUS * returnBonus;

      ranked.push({
        driverId: driver.id,
        driverName: `${driver.firstName || ''} ${driver.lastName || ''}`.trim(),
        distanceKm,
        proximityScore: Math.round(proximityScore * 100) / 100,
        reputationScore: Math.round(reputationScore * 100) / 100,
        acceptanceScore: Math.round(acceptanceScore * 100) / 100,
        returnBonus: Math.round(returnBonus * 100) / 100,
        totalScore: Math.round(totalScore * 100) / 100,
        isPortReturn,
        lastDeliveryPortId,
      });
    }

    // Ordenar por score total descendente
    ranked.sort((a, b) => b.totalScore - a.totalScore);

    this.logger.log(
      `Ranking calculado para trip ${tripId}: ${ranked.length} drivers, top score: ${ranked[0]?.totalScore}`,
    );

    return ranked;
  }

  // ==========================================
  // DRIVERS ELEGIBLES
  // ==========================================

  private async findEligibleDrivers(
    cargoType: CargoType,
    radiusKm: number,
    originLat: number,
    originLng: number,
  ): Promise<User[]> {
    const requiredEquipment = cargoType ? CARGO_EQUIPMENT_MAP[cargoType] : null;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .where('user.rol = :role', { role: UserRole.CHOFER })
      .andWhere('user.estado != :banned', { banned: UserStatus.BANNED })
      .andWhere('user.is_available = true')
      .andWhere('user.latitude IS NOT NULL')
      .andWhere('user.longitude IS NOT NULL');

    // Documentación válida
    const docValidationClause = `
      AND v.approval_status = '${VehicleStatus.APPROVED}'
      AND v.insurance_expiry_date IS NOT NULL AND v.insurance_expiry_date > CURRENT_DATE
      AND v.license_expiry_date IS NOT NULL AND v.license_expiry_date > CURRENT_DATE
      AND v.art_expiry_date IS NOT NULL AND v.art_expiry_date > CURRENT_DATE
      AND v.rc_expiry_date IS NOT NULL AND v.rc_expiry_date > CURRENT_DATE`;

    if (requiredEquipment) {
      qb.andWhere(
        `user.id IN (
          SELECT v.user_id FROM vehicles v
          WHERE v.is_active = true
          AND v.equipment_type IN (:...equipmentTypes)
          ${docValidationClause}
        )`,
        { equipmentTypes: requiredEquipment },
      );
    } else {
      qb.andWhere(
        `user.id IN (
          SELECT v.user_id FROM vehicles v
          WHERE v.is_active = true
          ${docValidationClause}
        )`,
      );
    }

    // No ocupados
    qb.andWhere(
      `user.id NOT IN (
        SELECT t.driver_id FROM trips t
        WHERE t.driver_id IS NOT NULL
        AND t.status IN (:...driverActiveStatuses)
      )`,
      { driverActiveStatuses: [TripStatus.ACCEPTED, TripStatus.IN_TRANSIT] },
    ).andWhere(
      `user.id NOT IN (
        SELECT t.assigned_driver_id FROM trips t
        WHERE t.assigned_driver_id IS NOT NULL
        AND t.status = :assignedStatus
      )`,
      { assignedStatus: TripStatus.ASSIGNED },
    );

    // No bloqueados por score
    qb.andWhere(
      `user.id NOT IN (
        SELECT ds.driver_id FROM driver_scores ds
        WHERE ds.status IN (:...blockedStatuses)
        AND (ds.blocked_until IS NULL OR ds.blocked_until > NOW())
      )`,
      { blockedStatuses: [DriverScoreStatus.BLOCKED, DriverScoreStatus.SUSPENDED] },
    );

    // Dentro del radio
    qb.addSelect(
      `(6371 * acos(LEAST(1.0, cos(radians(:lat)) * cos(radians(user.latitude)) * cos(radians(user.longitude) - radians(:lng)) + sin(radians(:lat)) * sin(radians(user.latitude)))))`,
      'distance',
    )
    .andWhere(
      `(6371 * acos(LEAST(1.0, cos(radians(:lat)) * cos(radians(user.latitude)) * cos(radians(user.longitude) - radians(:lng)) + sin(radians(:lat)) * sin(radians(user.latitude))))) <= :radius`,
      { radius: radiusKm },
    )
    .setParameter('lat', originLat)
    .setParameter('lng', originLng)
    .orderBy('distance', 'ASC')
    .limit(50); // Top 50 candidatos

    return qb.getMany();
  }

  // ==========================================
  // DRIVER SCORES - CRUD y CÁLCULO
  // ==========================================

  async getOrCreateScores(driverIds: string[]): Promise<DriverScore[]> {
    if (driverIds.length === 0) return [];

    const existing = await this.driverScoreRepository
      .createQueryBuilder('ds')
      .where('ds.driver_id IN (:...ids)', { ids: driverIds })
      .getMany();

    const existingIds = new Set(existing.map((s) => s.driverId));
    const missing = driverIds.filter((id) => !existingIds.has(id));

    if (missing.length > 0) {
      const newScores = missing.map((driverId) =>
        this.driverScoreRepository.create({ driverId }),
      );
      const saved = await this.driverScoreRepository.save(newScores);
      existing.push(...saved);
    }

    return existing;
  }

  async getDriverScore(driverId: string): Promise<DriverScore> {
    let score = await this.driverScoreRepository.findOne({
      where: { driverId },
    });

    if (!score) {
      score = this.driverScoreRepository.create({ driverId });
      score = await this.driverScoreRepository.save(score);
    }

    return score;
  }

  /**
   * Recalcula el score de un driver basándose en sus trips históricos.
   */
  async recalculateScore(driverId: string): Promise<DriverScore> {
    const score = await this.getDriverScore(driverId);

    // Contar trips
    const [completedTrips, cancelledTrips, totalTrips] = await Promise.all([
      this.tripRepository.count({
        where: { driverId, status: TripStatus.DELIVERED },
      }),
      this.tripRepository.count({
        where: { driverId, status: TripStatus.CANCELLED },
      }),
      this.tripRepository
        .createQueryBuilder('t')
        .where('t.driver_id = :driverId', { driverId })
        .andWhere('t.status IN (:...statuses)', {
          statuses: [TripStatus.DELIVERED, TripStatus.CANCELLED],
        })
        .getCount(),
    ]);

    // Rating promedio
    const ratingResult = await this.tripRepository
      .createQueryBuilder('t')
      .select('AVG(t.rating)', 'avg')
      .addSelect('COUNT(t.rating)', 'count')
      .where('t.driver_id = :driverId', { driverId })
      .andWhere('t.rating IS NOT NULL')
      .getRawOne();

    const avgRating = ratingResult?.avg ? Number(ratingResult.avg) : 5.0;
    const totalRatings = ratingResult?.count ? Number(ratingResult.count) : 0;

    // Puntualidad: trips entregados dentro de la estimación
    const onTimeResult = await this.tripRepository
      .createQueryBuilder('t')
      .where('t.driver_id = :driverId', { driverId })
      .andWhere('t.status = :status', { status: TripStatus.DELIVERED })
      .andWhere('t.delivered_at IS NOT NULL')
      .andWhere('t.estimated_delivery_at IS NOT NULL')
      .andWhere('t.delivered_at <= t.estimated_delivery_at + interval \'30 minutes\'')
      .getCount();

    const onTimeRate = completedTrips > 0 ? onTimeResult / completedTrips : 1.0;

    // Tasa de aceptación (basada en assignments, no solo trips)
    // Aproximación: rechazos = trips donde fue assignedDriverId pero no driverId
    const rejections = await this.tripRepository
      .createQueryBuilder('t')
      .where('t.assigned_driver_id = :driverId', { driverId })
      .andWhere('t.driver_id != :driverId OR t.driver_id IS NULL', { driverId })
      .getCount();

    const acceptances = completedTrips;
    const totalAssignments = acceptances + rejections;
    const acceptanceRate = totalAssignments > 0 ? acceptances / totalAssignments : 1.0;

    // Incidentes
    const incidentCount = await this.incidentRepository.count({
      where: { reportedById: driverId },
    });

    // Cálculo ponderado (todo normalizado a 0-5)
    const onTimeScore = onTimeRate * 5;
    const completionFactor = Math.min(completedTrips / 50, 1) * 5;
    const behaviorFactor = Math.max(0, Math.min(5, 5 - incidentCount * 0.5));

    const weightedScore =
      0.40 * onTimeScore +
      0.30 * avgRating +
      0.20 * completionFactor +
      0.10 * behaviorFactor;

    // Actualizar score
    score.totalTrips = totalTrips;
    score.completedTrips = completedTrips;
    score.cancelledTrips = cancelledTrips;
    score.onTimeCount = onTimeResult;
    score.onTimeRate = Math.round(onTimeRate * 10000) / 10000;
    score.acceptanceCount = acceptances;
    score.rejectionCount = rejections;
    score.acceptanceRate = Math.round(acceptanceRate * 10000) / 10000;
    score.avgRating = Math.round(avgRating * 100) / 100;
    score.totalRatings = totalRatings;
    score.incidentCount = incidentCount;
    score.weightedScore = Math.round(weightedScore * 100) / 100;
    score.lastCalculatedAt = new Date();

    // Reglas de bloqueo
    if (weightedScore < 2 && completedTrips >= 5) {
      if (score.blockCount >= 1) {
        score.status = DriverScoreStatus.SUSPENDED;
        this.logger.warn(`Driver ${driverId} SUSPENDED (reincidencia, score: ${weightedScore})`);
      } else {
        score.status = DriverScoreStatus.BLOCKED;
        score.blockCount += 1;
        score.blockedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días
        this.logger.warn(`Driver ${driverId} BLOCKED por 7 días (score: ${weightedScore})`);
      }
    } else if (weightedScore < 3 && completedTrips >= 5) {
      score.status = DriverScoreStatus.WARNING;
      this.logger.log(`Driver ${driverId} WARNING (score: ${weightedScore})`);
    } else {
      // Si estaba bloqueado y el bloqueo expiró, volver a ACTIVE
      if (
        score.status === DriverScoreStatus.BLOCKED &&
        score.blockedUntil &&
        new Date() > score.blockedUntil
      ) {
        score.status = DriverScoreStatus.ACTIVE;
        this.logger.log(`Driver ${driverId} desbloqueo automático (bloqueo expirado)`);
      } else if (score.status !== DriverScoreStatus.BLOCKED && score.status !== DriverScoreStatus.SUSPENDED) {
        score.status = DriverScoreStatus.ACTIVE;
      }
    }

    const saved = await this.driverScoreRepository.save(score);

    this.logger.log(
      `Score recalculado driver ${driverId}: ${weightedScore.toFixed(2)} (${saved.status})` +
      ` | trips: ${completedTrips}/${totalTrips}, rating: ${avgRating.toFixed(1)}, onTime: ${(onTimeRate * 100).toFixed(0)}%`,
    );

    return saved;
  }

  /**
   * Recalcula scores de todos los drivers.
   */
  async recalculateAll(): Promise<{ processed: number }> {
    const drivers = await this.userRepository.find({
      where: { rol: UserRole.CHOFER },
      select: ['id'],
    });

    let processed = 0;
    for (const driver of drivers) {
      await this.recalculateScore(driver.id);
      processed++;
    }

    this.logger.log(`Recálculo masivo completado: ${processed} drivers`);
    return { processed };
  }

  /**
   * Obtiene ranking general de drivers.
   */
  async getDriverRanking(limit = 50): Promise<DriverScore[]> {
    return this.driverScoreRepository.find({
      order: { weightedScore: 'DESC' },
      take: limit,
      relations: ['driver'],
    });
  }

  // ==========================================
  // HELPERS PRIVADOS
  // ==========================================

  /**
   * Obtiene el último viaje entregado de cada driver.
   */
  private async getLastDeliveredTrips(driverIds: string[]): Promise<Trip[]> {
    if (driverIds.length === 0) return [];

    // Usar query raw con DISTINCT ON para obtener último trip entregado por driver
    const subquery = this.tripRepository
      .createQueryBuilder('t2')
      .select('DISTINCT ON (t2.driver_id) t2.id')
      .where('t2.driver_id IN (:...subDriverIds)', { subDriverIds: driverIds })
      .andWhere('t2.status = :subStatus', { subStatus: TripStatus.DELIVERED })
      .orderBy('t2.driver_id')
      .addOrderBy('t2.delivered_at', 'DESC');

    return this.tripRepository
      .createQueryBuilder('t')
      .where('t.driver_id IN (:...driverIds)', { driverIds })
      .andWhere('t.status = :status', { status: TripStatus.DELIVERED })
      .andWhere(`t.id IN (${subquery.getQuery()})`)
      .setParameters(subquery.getParameters())
      .getMany();
  }
}
