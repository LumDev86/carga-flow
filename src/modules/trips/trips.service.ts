import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Trip } from './entities/trip.entity';
import { User } from '../users/entities/user.entity';
import { EventsGateway } from '../events/events.gateway';
import { GeolocationService } from '../geolocation/geolocation.service';
import { PushNotificationService } from '../notifications/push-notification.service';
import { TariffService } from '../tariffs/tariffs.service';
import { WalletService } from '../wallet/wallet.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentMethodEnum } from '../../shared/enums/payment-method.enum';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { CompleteTripDto } from './dto/complete-trip.dto';
import { RateTripDto } from './dto/rate-trip.dto';
import { TripFiltersDto } from './dto/trip-filters.dto';
import { UpdateDriverLocationDto } from './dto/update-location.dto';
import { TripStatus } from '../../shared/enums/trip-status.enum';
import { UserRole } from '../../shared/enums/user-role.enum';
import { UserStatus } from '../../shared/enums/user-status.enum';
import { CargoType } from '../../shared/enums/cargo-type.enum';
import { EquipmentType } from '../../shared/enums/equipment-type.enum';
import * as bcrypt from 'bcrypt';

const ASSIGNMENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const CARGO_EQUIPMENT_MAP: Record<CargoType, EquipmentType[] | null> = {
  [CargoType.GRANO]: [EquipmentType.TOLVA, EquipmentType.CISTERNA],
  [CargoType.PALES]: [EquipmentType.BARANDA_REBATIBLE, EquipmentType.FURGON, EquipmentType.PLAYO, EquipmentType.CARROZADO],
  [CargoType.GRANEL]: [EquipmentType.TOLVA, EquipmentType.CISTERNA, EquipmentType.BARANDA_REBATIBLE],
  [CargoType.CARGA_GENERAL]: null,
};

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);
  private readonly tripsQueue: Queue | null = null;

  constructor(
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly eventsGateway: EventsGateway,
    private readonly geolocationService: GeolocationService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly tariffService: TariffService,
    private readonly walletService: WalletService,
    private readonly paymentsService: PaymentsService,
    @Optional()
    @Inject('TRIPS_QUEUE')
    tripsQueueFallback: Queue | null,
    @Optional()
    @InjectQueue('trips')
    tripsQueueBull?: Queue,
  ) {
    // Use Bull queue if available, otherwise use the fallback (null)
    this.tripsQueue = tripsQueueBull || tripsQueueFallback || null;
    if (!this.tripsQueue) {
      this.logger.warn('Redis not configured - assignment timeout jobs disabled');
    }
  }

  async createTrip(userId: string, dto: CreateTripDto): Promise<Trip> {
    this.logger.log(`Creating trip for user: ${userId}`);

    if (!userId) {
      throw new BadRequestException('userId is required to create a trip');
    }

    // Calculate route
    const directions = await this.geolocationService.getDirections(
      dto.originLat,
      dto.originLng,
      dto.destinationLat,
      dto.destinationLng,
    );

    const distanceKm = directions?.distance || 0;
    const estimatedDuration = directions?.durationText || null;

    if (distanceKm <= 0) {
      throw new BadRequestException(
        'No se pudo calcular la distancia del viaje. Verifica las direcciones ingresadas.',
      );
    }

    // Calculate pricing
    let price: number;
    let commission: number;
    let driverPayout: number;

    const isGrainCargo =
      dto.cargoType === CargoType.GRANO || dto.cargoType === CargoType.GRANEL;

    if (isGrainCargo && dto.cargoWeight) {
      // Tarifa cerealera Fe.Tr.A: $/TN × toneladas
      const weightTon =
        dto.cargoWeightUnit === 'ton'
          ? dto.cargoWeight
          : dto.cargoWeight / 1000;

      const grainPrice = await this.tariffService.calculateGrainPrice(
        distanceKm,
        weightTon,
      );

      if (grainPrice) {
        price = grainPrice.totalPrice;
        commission = grainPrice.commission;
        driverPayout = grainPrice.driverPayout;
        this.logger.log(
          `Tarifa cerealera aplicada: ${grainPrice.pricePerTon} $/TN × ${weightTon} TN = $${price}`,
        );
      } else {
        // Fallback a tarifa estándar si no hay tabla cerealera cargada
        this.logger.warn('No hay tarifas cerealeras cargadas, usando tarifa estándar');
        const tariff = dto.transportType
          ? await this.tariffService.getTariffForTransport(dto.transportType)
          : null;
        const pricePerKm = tariff ? Number(tariff.pricePerKm) : 50;
        const commissionRate = tariff ? Number(tariff.commissionRate) : 0.15;
        price = Math.round(distanceKm * pricePerKm);
        commission = Math.round(price * commissionRate);
        driverPayout = price - commission;
      }
    } else {
      // Tarifa estándar: $/km × distancia
      const tariff = dto.transportType
        ? await this.tariffService.getTariffForTransport(dto.transportType)
        : null;
      const pricePerKm = tariff ? Number(tariff.pricePerKm) : 50;
      const commissionRate = tariff ? Number(tariff.commissionRate) : 0.15;
      price = Math.round(distanceKm * pricePerKm);
      commission = Math.round(price * commissionRate);
      driverPayout = price - commission;
    }

    // Create trip
    const trip = this.tripRepository.create({
      requesterId: userId,
      requester: { id: userId } as User,
      originAddress: dto.originAddress,
      originLat: dto.originLat,
      originLng: dto.originLng,
      originCity: dto.originCity || null,
      originState: dto.originState || null,
      destinationAddress: dto.destinationAddress,
      destinationLat: dto.destinationLat,
      destinationLng: dto.destinationLng,
      destinationCity: dto.destinationCity || null,
      destinationState: dto.destinationState || null,
      cargoDescription: dto.cargoDescription,
      cargoType: dto.cargoType,
      transportType: dto.transportType,
      cargoWeight: dto.cargoWeight || null,
      cargoWeightUnit: dto.cargoWeightUnit || 'kg',
      cargoPallets: dto.cargoPallets || null,
      cargoFragile: dto.cargoFragile || false,
      cargoInstructions: dto.cargoInstructions || null,
      distanceKm,
      estimatedDuration,
      price,
      commission,
      driverPayout,
      scheduledPickupAt: dto.scheduledPickupAt ? new Date(dto.scheduledPickupAt) : null,
      estimatedDeliveryAt: dto.estimatedDeliveryAt ? new Date(dto.estimatedDeliveryAt) : null,
      paymentMethod: dto.paymentMethod || PaymentMethodEnum.CASH,
      status: TripStatus.PENDING,
    });

    this.logger.log(`Trip entity created, requesterId: ${trip.requesterId}, requester.id: ${trip.requester?.id}`);

    const savedTrip = await this.tripRepository.save(trip);

    // Búsqueda progresiva: empezar por el primer radio
    const firstRadiusKm = TripsService.SEARCH_RADII_KM[0];
    const nearestDriver = await this.findNearestDriverInRadius(dto.originLat, dto.originLng, firstRadiusKm, dto.cargoType);

    // Emitir evento de búsqueda expandiendo (radio inicial)
    this.eventsGateway.emitToUser(userId, 'trip:search_expanding', {
      tripId: savedTrip.id,
      radiusKm: firstRadiusKm,
      radiusIndex: 0,
      totalRadii: TripsService.SEARCH_RADII_KM.length,
    });

    if (nearestDriver) {
      // Assign to nearest driver (only set assignedDriverId, driverId is set on accept)
      savedTrip.status = TripStatus.ASSIGNED;
      savedTrip.assignedDriverId = nearestDriver.id;
      savedTrip.searchRadiusIndex = 0;
      savedTrip.assignmentExpiresAt = new Date(Date.now() + ASSIGNMENT_TIMEOUT_MS);
      await this.tripRepository.save(savedTrip);

      await this.attachRequesterTripCount(savedTrip);

      this.eventsGateway.emitToDriver(nearestDriver.id, 'trip:assigned', savedTrip);
      this.eventsGateway.emitToUser(userId, 'trip:assigned', savedTrip);
      this.eventsGateway.emitTripUpdate(savedTrip.id, 'trip:assigned', savedTrip);

      this.pushNotificationService.sendToUser(nearestDriver.id, {
        title: 'Nueva solicitud de viaje',
        body: `${savedTrip.originAddress} → ${savedTrip.destinationAddress}`,
        data: { tripId: savedTrip.id, type: 'trip:assigned' },
      });

      this.eventsGateway.emitToUser(userId, 'trip:driver_notified', {
        tripId: savedTrip.id,
        driver: {
          id: nearestDriver.id,
          name: `${nearestDriver.firstName || ''} ${nearestDriver.lastName || ''}`.trim(),
          avatarUrl: nearestDriver.avatarUrl || null,
        },
      });

      if (this.tripsQueue) {
        await this.tripsQueue.add(
          'assignment-timeout',
          { tripId: savedTrip.id },
          { delay: ASSIGNMENT_TIMEOUT_MS, jobId: `assignment-${savedTrip.id}` },
        );
      }

      this.logger.log(`Trip ${savedTrip.id} assigned to driver ${nearestDriver.id}`);
    } else {
      // No driver in first radius — schedule expansion to next radius
      savedTrip.searchRadiusIndex = 0;
      await this.tripRepository.save(savedTrip);

      if (this.tripsQueue && TripsService.SEARCH_RADII_KM.length > 1) {
        try {
          await this.tripsQueue.add(
            'radius-expansion',
            { tripId: savedTrip.id, radiusIndex: 1 },
            { delay: TripsService.RADIUS_EXPANSION_DELAY_MS, jobId: `radius-${savedTrip.id}-1` },
          );
          this.logger.log(`Trip ${savedTrip.id} no driver in ${firstRadiusKm}km, scheduling expansion to index 1`);
        } catch (error: any) {
          this.logger.error(`Failed to schedule radius expansion: ${error.message}`);
          await this.doBroadcast(savedTrip);
        }
      } else {
        // No queue or only one radius — broadcast immediately
        await this.doBroadcast(savedTrip);
      }
    }

    // Reload with relations
    const result = await this.tripRepository.findOne({
      where: { id: savedTrip.id },
      relations: ['requester', 'driver'],
    });
    return result!;
  }

  // Radios de búsqueda progresiva en km
  static readonly SEARCH_RADII_KM = [1, 2, 4, 7];
  private static readonly RADIUS_EXPANSION_DELAY_MS = 10_000; // 10 segundos entre expansiones

  async findNearestDriverInRadius(lat: number, lng: number, radiusKm: number, cargoType?: CargoType): Promise<User | null> {
    this.logger.log(`Searching for driver within ${radiusKm}km radius`);

    const requiredEquipment = cargoType ? CARGO_EQUIPMENT_MAP[cargoType] : null;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .where('user.rol = :role', { role: UserRole.CHOFER })
      .andWhere('user.estado != :banned', { banned: UserStatus.BANNED })
      .andWhere('user.is_available = true')
      .andWhere('user.latitude IS NOT NULL')
      .andWhere('user.longitude IS NOT NULL');

    if (requiredEquipment) {
      qb.andWhere(
        `user.id IN (
          SELECT v.user_id FROM vehicles v
          WHERE v.is_active = true
          AND v.equipment_type IN (:...equipmentTypes)
        )`,
        { equipmentTypes: requiredEquipment },
      );
    } else {
      qb.andWhere(
        `user.id IN (
          SELECT v.user_id FROM vehicles v WHERE v.is_active = true
        )`,
      );
    }

    qb.andWhere(
        `user.id NOT IN (
          SELECT t.driver_id FROM trips t
          WHERE t.driver_id IS NOT NULL
          AND t.status IN (:...driverActiveStatuses)
        )`,
        { driverActiveStatuses: [TripStatus.ACCEPTED, TripStatus.IN_TRANSIT] },
      )
      .andWhere(
        `user.id NOT IN (
          SELECT t.assigned_driver_id FROM trips t
          WHERE t.assigned_driver_id IS NOT NULL
          AND t.status = :assignedStatus
        )`,
        { assignedStatus: TripStatus.ASSIGNED },
      )
      .addSelect(
        `(6371 * acos(cos(radians(:lat)) * cos(radians(user.latitude)) * cos(radians(user.longitude) - radians(:lng)) + sin(radians(:lat)) * sin(radians(user.latitude))))`,
        'distance',
      )
      .andWhere(
        `(6371 * acos(cos(radians(:lat)) * cos(radians(user.latitude)) * cos(radians(user.longitude) - radians(:lng)) + sin(radians(:lat)) * sin(radians(user.latitude)))) <= :radius`,
        { radius: radiusKm },
      )
      .setParameter('lat', lat)
      .setParameter('lng', lng)
      .orderBy('distance', 'ASC')
      .limit(1);

    const driver = await qb.getOne();

    if (driver) {
      this.logger.log(`Driver found within ${radiusKm}km radius`);
    }
    return driver;
  }

  async getMyTrips(userId: string, filters?: TripFiltersDto): Promise<Trip[]> {
    const qb = this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.requester', 'requester')
      .leftJoinAndSelect('trip.driver', 'driver')
      .where('(trip.requester_id = :userId OR trip.driver_id = :userId)', { userId })
      .orderBy('trip.created_at', 'DESC');

    if (filters?.status) {
      qb.andWhere('trip.status = :status', { status: filters.status });
    }

    if (filters?.search) {
      qb.andWhere(
        '(trip.cargo_description ILIKE :search OR trip.origin_address ILIKE :search OR trip.destination_address ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    return qb.getMany();
  }

  async getAvailableTrips(): Promise<Trip[]> {
    return this.tripRepository.find({
      where: { status: TripStatus.BROADCAST },
      relations: ['requester'],
      order: { createdAt: 'DESC' },
    });
  }

  async getMyAssignedTrips(driverId: string): Promise<Trip[]> {
    return this.tripRepository.find({
      where: {
        assignedDriverId: driverId,
        status: TripStatus.ASSIGNED,
      },
      relations: ['requester'],
      order: { createdAt: 'DESC' },
    });
  }

  async getActiveTrips(userId: string): Promise<Trip[]> {
    return this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.requester', 'requester')
      .leftJoinAndSelect('trip.driver', 'driver')
      .where('(trip.requester_id = :userId OR trip.driver_id = :userId)', { userId })
      .andWhere('trip.status IN (:...statuses)', {
        statuses: [TripStatus.ACCEPTED, TripStatus.IN_TRANSIT],
      })
      .orderBy('trip.created_at', 'DESC')
      .getMany();
  }

  async getTripStats(userId: string) {
    const trips = await this.tripRepository
      .createQueryBuilder('trip')
      .where('(trip.requester_id = :userId OR trip.driver_id = :userId)', { userId })
      .getMany();

    // Earnings calculation for driver (uses Argentina timezone UTC-3)
    const now = new Date();
    const argentinaOffset = -3 * 60; // UTC-3 in minutes
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const argNow = new Date(utcMs + argentinaOffset * 60000);
    const todayStart = new Date(argNow);
    todayStart.setHours(0, 0, 0, 0);
    // Convert back to UTC for DB comparison
    const todayStartUtc = new Date(todayStart.getTime() - argentinaOffset * 60000);

    const earningsResult = await this.tripRepository
      .createQueryBuilder('trip')
      .select('COALESCE(SUM(trip.driver_payout), 0)', 'totalEarnings')
      .addSelect('COUNT(trip.id)', 'totalDelivered')
      .where('trip.driver_id = :userId', { userId })
      .andWhere('trip.status = :status', { status: TripStatus.DELIVERED })
      .getRawOne();

    const todayResult = await this.tripRepository
      .createQueryBuilder('trip')
      .select('COALESCE(SUM(trip.driver_payout), 0)', 'earningsToday')
      .addSelect('COUNT(trip.id)', 'tripsToday')
      .where('trip.driver_id = :userId', { userId })
      .andWhere('trip.status = :status', { status: TripStatus.DELIVERED })
      .andWhere('trip.delivered_at >= :todayStart', { todayStart: todayStartUtc })
      .getRawOne();

    return {
      total: trips.length,
      pending: trips.filter((t) => t.status === TripStatus.PENDING).length,
      assigned: trips.filter((t) => t.status === TripStatus.ASSIGNED).length,
      broadcast: trips.filter((t) => t.status === TripStatus.BROADCAST).length,
      accepted: trips.filter((t) => t.status === TripStatus.ACCEPTED).length,
      inTransit: trips.filter((t) => t.status === TripStatus.IN_TRANSIT).length,
      delivered: trips.filter((t) => t.status === TripStatus.DELIVERED).length,
      cancelled: trips.filter((t) => t.status === TripStatus.CANCELLED).length,
      earningsToday: parseFloat(todayResult?.earningsToday) || 0,
      tripsToday: parseInt(todayResult?.tripsToday) || 0,
      totalEarnings: parseFloat(earningsResult?.totalEarnings) || 0,
      totalDelivered: parseInt(earningsResult?.totalDelivered) || 0,
    };
  }

  async getMyReviews(driverId: string) {
    const trips = await this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.requester', 'requester')
      .where('trip.driver_id = :driverId', { driverId })
      .andWhere('trip.status = :status', { status: TripStatus.DELIVERED })
      .andWhere('trip.rating IS NOT NULL')
      .orderBy('trip.delivered_at', 'DESC')
      .getMany();

    const ratings = trips.map((t) => t.rating!);
    const averageRating =
      ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
        : 0;

    const ratingCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of ratings) {
      ratingCounts[r] = (ratingCounts[r] || 0) + 1;
    }

    return {
      averageRating: Math.round(averageRating * 100) / 100,
      totalReviews: trips.length,
      ratingCounts,
      reviews: trips.map((t) => ({
        id: t.id,
        rating: t.rating,
        comments: t.ratingComments,
        deliveredAt: t.deliveredAt,
        requesterName: t.requester
          ? `${t.requester.firstName} ${t.requester.lastName}`.trim()
          : 'Usuario',
        route: `${t.originAddress} → ${t.destinationAddress}`,
      })),
    };
  }

  async getTripById(tripId: string, userId: string): Promise<Trip> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    // Validate user has relation with the trip (broadcast trips are visible to all drivers)
    const hasRelation =
      trip.requesterId === userId ||
      trip.driverId === userId ||
      trip.assignedDriverId === userId ||
      trip.status === TripStatus.BROADCAST;

    if (!hasRelation) {
      throw new ForbiddenException('No tienes acceso a este viaje');
    }

    return trip;
  }

  async acceptTrip(tripId: string, driverId: string): Promise<Trip> {
    const queryRunner = this.tripRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock the trip row to prevent concurrent accepts (no LEFT JOINs with FOR UPDATE)
      const trip = await queryRunner.manager
        .getRepository(Trip)
        .createQueryBuilder('trip')
        .setLock('pessimistic_write')
        .where('trip.id = :tripId', { tripId })
        .getOne();

      if (!trip) {
        throw new NotFoundException('Viaje no encontrado');
      }

      // Validate state transition
      if (trip.status === TripStatus.ASSIGNED) {
        if (trip.assignedDriverId !== driverId) {
          throw new ForbiddenException('Este viaje no está asignado a ti');
        }
      } else if (trip.status !== TripStatus.BROADCAST) {
        throw new BadRequestException(
          `No se puede aceptar un viaje en estado ${trip.status}`,
        );
      }

      trip.status = TripStatus.ACCEPTED;
      trip.driverId = driverId;
      trip.assignedDriverId = driverId;
      trip.acceptedAt = new Date();

      await queryRunner.manager.save(trip);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Remove timeout and radius-expansion jobs
    if (this.tripsQueue) {
      try {
        const job = await this.tripsQueue.getJob(`assignment-${tripId}`);
        if (job) await job.remove();
      } catch (e) {}
      for (let i = 0; i < TripsService.SEARCH_RADII_KM.length; i++) {
        try {
          const job = await this.tripsQueue.getJob(`radius-${tripId}-${i}`);
          if (job) await job.remove();
        } catch (e) {}
      }
    }

    // Reload with relations
    const fullTrip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    });

    if (!fullTrip) {
      throw new NotFoundException('Error al cargar viaje');
    }

    // Notify requester
    this.eventsGateway.emitToUser(fullTrip.requesterId, 'trip:accepted', fullTrip);
    this.eventsGateway.emitTripUpdate(tripId, 'trip:accepted', fullTrip);

    this.pushNotificationService.sendToUser(fullTrip.requesterId, {
      title: 'Conductor encontrado',
      body: `${fullTrip.driver?.firstName || 'Un conductor'} aceptó tu envío`,
      data: { tripId, type: 'trip:accepted' },
    });

    this.logger.log(`Trip ${tripId} accepted by driver ${driverId}`);

    return fullTrip;
  }

  async rejectTrip(tripId: string, driverId: string): Promise<Trip> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    if (trip.status !== TripStatus.ASSIGNED || trip.assignedDriverId !== driverId) {
      throw new BadRequestException('No puedes rechazar este viaje');
    }

    // Remove timeout job
    if (this.tripsQueue) {
      try {
        const job = await this.tripsQueue.getJob(`assignment-${tripId}`);
        if (job) await job.remove();
      } catch (e) {}
    }

    // Notify the driver that their assignment expired
    this.eventsGateway.emitToDriver(driverId, 'trip:assignment_expired', trip);

    // Notify requester that this driver stopped viewing
    this.eventsGateway.emitToUser(trip.requesterId, 'trip:driver_stopped_viewing', {
      tripId,
      driverId,
    });

    // Try next radius before broadcasting
    const currentRadiusIndex = trip.searchRadiusIndex ?? 0;
    const nextRadiusIndex = currentRadiusIndex + 1;

    if (nextRadiusIndex < TripsService.SEARCH_RADII_KM.length) {
      // Revert to PENDING and try next radius
      trip.status = TripStatus.PENDING;
      trip.driver = null;
      trip.driverId = null;
      trip.assignedDriverId = null;
      trip.assignmentExpiresAt = null;
      await this.tripRepository.save(trip);

      if (this.tripsQueue) {
        try {
          await this.tripsQueue.add(
            'radius-expansion',
            { tripId, radiusIndex: nextRadiusIndex },
            { delay: 0, jobId: `radius-${tripId}-${nextRadiusIndex}` },
          );
        } catch (error: any) {
          this.logger.error(`Failed to schedule radius expansion on reject: ${error.message}`);
          await this.doBroadcast(trip);
        }
      } else {
        await this.expandSearchRadius(tripId, nextRadiusIndex);
      }

      this.logger.log(`Trip ${tripId} rejected by driver ${driverId}, expanding to radius index ${nextRadiusIndex}`);
    } else {
      // All radii exhausted — broadcast
      await this.doBroadcast(trip);
      this.logger.log(`Trip ${tripId} rejected by driver ${driverId}, all radii exhausted, now broadcast`);
    }

    return this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    }) as Promise<Trip>;
  }

  async startTrip(tripId: string, driverId: string): Promise<Trip> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    if (trip.driverId !== driverId) {
      throw new ForbiddenException('No eres el conductor de este viaje');
    }

    if (trip.status !== TripStatus.ACCEPTED) {
      throw new BadRequestException(
        `No se puede iniciar un viaje en estado ${trip.status}`,
      );
    }

    trip.status = TripStatus.IN_TRANSIT;
    trip.pickedUpAt = new Date();

    const savedTrip = await this.tripRepository.save(trip);

    // Notify requester
    this.eventsGateway.emitToUser(trip.requesterId, 'trip:in_transit', savedTrip);
    this.eventsGateway.emitTripUpdate(tripId, 'trip:in_transit', savedTrip);

    this.pushNotificationService.sendToUser(trip.requesterId, {
      title: 'Envío en camino',
      body: `Tu envío hacia ${trip.destinationAddress} está en camino`,
      data: { tripId, type: 'trip:in_transit' },
    });

    this.logger.log(`Trip ${tripId} started by driver ${driverId}`);

    return savedTrip;
  }

  async completeTrip(
    tripId: string,
    driverId: string,
    dto: CompleteTripDto,
  ): Promise<Trip> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    if (trip.driverId !== driverId) {
      throw new ForbiddenException('No eres el conductor de este viaje');
    }

    if (trip.status !== TripStatus.IN_TRANSIT) {
      throw new BadRequestException(
        `No se puede completar un viaje en estado ${trip.status}`,
      );
    }

    trip.status = TripStatus.DELIVERED;
    trip.deliveredAt = new Date();
    trip.remitoUrl = dto.remitoUrl || null;
    trip.cargoPhotoUrl = dto.cargoPhotoUrl || null;
    trip.observations = dto.observations || null;

    // Escrow: capture card payment if applicable
    if (
      trip.paymentMethod === PaymentMethodEnum.CARD &&
      trip.paymentIntentId &&
      trip.paymentStatus === 'authorized'
    ) {
      try {
        await this.paymentsService.capturePayment(trip.paymentIntentId);
        trip.paymentStatus = 'captured';
        this.logger.log(`Trip ${tripId}: payment captured`);
      } catch (error: any) {
        this.logger.error(`Trip ${tripId}: failed to capture payment - ${error.message}`);
        throw new BadRequestException('Error al capturar el pago con tarjeta');
      }
    }

    // Credit driver wallet
    if (trip.driverPayout > 0 && trip.driverId) {
      try {
        await this.walletService.creditDriver(
          trip.driverId,
          trip.driverPayout,
          tripId,
          `Viaje ${trip.originAddress} → ${trip.destinationAddress}`,
        );
        this.logger.log(`Trip ${tripId}: wallet credited $${trip.driverPayout} to driver ${trip.driverId}`);
      } catch (error: any) {
        this.logger.error(`Trip ${tripId}: failed to credit wallet - ${error.message}`);
      }
    }

    // Mark payment as completed
    const isOffPlatformPayment = [
      PaymentMethodEnum.CASH,
      PaymentMethodEnum.BANK_TRANSFER,
      PaymentMethodEnum.CHECK,
    ].includes(trip.paymentMethod);
    if (trip.paymentStatus === 'captured' || isOffPlatformPayment) {
      trip.paymentStatus = 'completed';
    }

    const savedTrip = await this.tripRepository.save(trip);

    // Notify requester
    this.eventsGateway.emitToUser(trip.requesterId, 'trip:delivered', savedTrip);
    this.eventsGateway.emitTripUpdate(tripId, 'trip:delivered', savedTrip);

    this.pushNotificationService.sendToUser(trip.requesterId, {
      title: 'Envío entregado',
      body: `Tu envío a ${trip.destinationAddress} fue entregado. ¡Calificá al conductor!`,
      data: { tripId, type: 'trip:delivered' },
    });

    this.logger.log(`Trip ${tripId} delivered by driver ${driverId}`);

    return savedTrip;
  }

  async cancelTrip(tripId: string, userId: string): Promise<Trip> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    const isRequester = trip.requesterId === userId;
    const isDriver = trip.driverId === userId || trip.assignedDriverId === userId;

    if (!isRequester && !isDriver) {
      throw new ForbiddenException('No tienes permiso para cancelar este viaje');
    }

    // Statuses the requester can cancel
    const requesterCancellable = [
      TripStatus.PENDING,
      TripStatus.ASSIGNED,
      TripStatus.BROADCAST,
      TripStatus.ACCEPTED,
    ];

    // Statuses the driver can cancel
    const driverCancellable = [
      TripStatus.ACCEPTED,
      TripStatus.IN_TRANSIT,
    ];

    const allowedStatuses = isRequester ? requesterCancellable : driverCancellable;

    if (!allowedStatuses.includes(trip.status)) {
      throw new BadRequestException(
        `No se puede cancelar un viaje en estado ${trip.status}`,
      );
    }

    const previousStatus = trip.status;
    const previousDriverId = trip.driverId || trip.assignedDriverId;

    // Release held card payment if authorized
    if (
      trip.paymentMethod === PaymentMethodEnum.CARD &&
      trip.paymentIntentId &&
      trip.paymentStatus === 'authorized'
    ) {
      try {
        await this.paymentsService.cancelPaymentIntent(trip.paymentIntentId);
        trip.paymentStatus = 'cancelled';
        this.logger.log(`Trip ${tripId}: payment authorization released`);
      } catch (error: any) {
        this.logger.error(`Trip ${tripId}: failed to cancel payment - ${error.message}`);
      }
    }

    trip.status = TripStatus.CANCELLED;
    trip.cancelledAt = new Date();

    const savedTrip = await this.tripRepository.save(trip);

    // Remove timeout and radius-expansion jobs
    if (this.tripsQueue) {
      try {
        const job = await this.tripsQueue.getJob(`assignment-${tripId}`);
        if (job) await job.remove();
      } catch (e) {}
      // Clean up any pending radius-expansion jobs
      for (let i = 0; i < TripsService.SEARCH_RADII_KM.length; i++) {
        try {
          const job = await this.tripsQueue.getJob(`radius-${tripId}-${i}`);
          if (job) await job.remove();
        } catch (e) {}
      }
    }

    // Notify the other party
    if (isDriver) {
      this.eventsGateway.emitToUser(trip.requesterId, 'trip:cancelled', savedTrip);
      // Notify requester that this driver stopped viewing
      this.eventsGateway.emitToUser(trip.requesterId, 'trip:driver_stopped_viewing', {
        tripId,
        driverId: userId,
      });
      this.pushNotificationService.sendToUser(trip.requesterId, {
        title: 'Viaje cancelado',
        body: 'El conductor canceló el viaje',
        data: { tripId, type: 'trip:cancelled' },
      });
    } else if (previousDriverId) {
      this.eventsGateway.emitToDriver(previousDriverId, 'trip:cancelled', savedTrip);
      this.pushNotificationService.sendToUser(previousDriverId, {
        title: 'Viaje cancelado',
        body: 'El solicitante canceló el viaje',
        data: { tripId, type: 'trip:cancelled' },
      });
    }

    // If was broadcast, notify all drivers
    if (previousStatus === TripStatus.BROADCAST) {
      this.eventsGateway.emitToAllDrivers('trip:cancelled', savedTrip);
    }

    this.eventsGateway.emitTripUpdate(tripId, 'trip:cancelled', savedTrip);

    this.logger.log(`Trip ${tripId} cancelled by ${isDriver ? 'driver' : 'requester'} ${userId}`);

    return savedTrip;
  }

  async rateTrip(tripId: string, userId: string, dto: RateTripDto): Promise<Trip> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    if (trip.requesterId !== userId) {
      throw new ForbiddenException('Solo el solicitante puede calificar');
    }

    if (trip.status !== TripStatus.DELIVERED) {
      throw new BadRequestException('Solo se pueden calificar viajes completados');
    }

    if (trip.rating != null) {
      throw new BadRequestException('Este viaje ya fue calificado');
    }

    trip.rating = dto.rating;
    trip.ratingComments = dto.comments || null;

    return this.tripRepository.save(trip);
  }

  async updateCartaDePorteUrl(tripId: string, url: string): Promise<void> {
    const trip = await this.tripRepository.findOne({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }
    trip.cartaDePorteUrl = url;
    await this.tripRepository.save(trip);
  }

  async updateDriverLocation(
    tripId: string,
    driverId: string,
    dto: UpdateDriverLocationDto,
  ): Promise<void> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    if (trip.driverId !== driverId) {
      throw new ForbiddenException('No eres el conductor de este viaje');
    }

    if (trip.status !== TripStatus.IN_TRANSIT) {
      throw new BadRequestException('El viaje no está en tránsito');
    }

    // Update driver location in user table
    await this.userRepository.update(driverId, {
      latitude: dto.latitude,
      longitude: dto.longitude,
    });

    // Emit location to requester and trip subscribers
    const locationData = {
      tripId,
      driverId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      heading: dto.heading,
      speed: dto.speed,
      timestamp: new Date().toISOString(),
    };

    this.eventsGateway.emitToUser(trip.requesterId, 'trip:driver_location', locationData);
    this.eventsGateway.emitTripUpdate(tripId, 'trip:driver_location', locationData);
  }

  async markTripAsViewing(tripId: string, driverId: string): Promise<void> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    if (trip.status !== TripStatus.ASSIGNED && trip.status !== TripStatus.BROADCAST) {
      throw new BadRequestException('El viaje no está en estado de búsqueda');
    }

    const driver = await this.userRepository.findOne({
      where: { id: driverId },
    });

    if (!driver) {
      throw new NotFoundException('Conductor no encontrado');
    }

    // Notify requester that a driver is viewing their trip
    this.eventsGateway.emitToUser(trip.requesterId, 'trip:driver_viewing', {
      tripId,
      driver: {
        id: driver.id,
        name: `${driver.firstName || ''} ${driver.lastName || ''}`.trim(),
        avatarUrl: driver.avatarUrl || null,
      },
    });

    this.logger.log(`Driver ${driverId} viewing trip ${tripId}`);
  }

  // Called by Bull processor when assignment times out
  async broadcastTrip(tripId: string): Promise<void> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    });

    if (!trip || trip.status !== TripStatus.ASSIGNED) {
      return; // Already changed state
    }

    const previousDriverId = trip.assignedDriverId || trip.driverId;

    // Notify previous driver
    if (previousDriverId) {
      this.eventsGateway.emitToDriver(previousDriverId, 'trip:assignment_expired', trip);

      // Notify requester that this driver stopped viewing
      this.eventsGateway.emitToUser(trip.requesterId, 'trip:driver_stopped_viewing', {
        tripId,
        driverId: previousDriverId,
      });
    }

    // Try next radius before broadcasting
    const currentRadiusIndex = trip.searchRadiusIndex ?? 0;
    const nextRadiusIndex = currentRadiusIndex + 1;

    if (nextRadiusIndex < TripsService.SEARCH_RADII_KM.length) {
      // Revert to PENDING and try next radius
      trip.status = TripStatus.PENDING;
      trip.driver = null;
      trip.driverId = null;
      trip.assignedDriverId = null;
      trip.assignmentExpiresAt = null;
      await this.tripRepository.save(trip);

      if (this.tripsQueue) {
        try {
          await this.tripsQueue.add(
            'radius-expansion',
            { tripId, radiusIndex: nextRadiusIndex },
            { delay: 0, jobId: `radius-${tripId}-${nextRadiusIndex}` },
          );
        } catch (error: any) {
          this.logger.error(`Failed to schedule radius expansion on timeout: ${error.message}`);
          await this.doBroadcast(trip);
        }
      } else {
        await this.expandSearchRadius(tripId, nextRadiusIndex);
      }

      this.logger.log(`Trip ${tripId} assignment expired, expanding to radius index ${nextRadiusIndex}`);
    } else {
      // All radii exhausted — broadcast
      await this.doBroadcast(trip);
      this.logger.log(`Trip ${tripId} assignment expired, all radii exhausted, now broadcast`);
    }
  }

  // Búsqueda progresiva: expandir al siguiente radio
  async expandSearchRadius(tripId: string, radiusIndex: number): Promise<void> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    });

    if (!trip) return;

    // Only expand if still in PENDING (not cancelled/accepted/etc)
    if (trip.status !== TripStatus.PENDING) {
      this.logger.log(`Trip ${tripId} no longer PENDING (${trip.status}), skipping radius expansion`);
      return;
    }

    // All radii exhausted → broadcast
    if (radiusIndex >= TripsService.SEARCH_RADII_KM.length) {
      await this.doBroadcast(trip);
      this.logger.log(`Trip ${tripId} all radii exhausted, broadcasting`);
      return;
    }

    const radiusKm = TripsService.SEARCH_RADII_KM[radiusIndex];

    // Emit search_expanding to requester
    this.eventsGateway.emitToUser(trip.requesterId, 'trip:search_expanding', {
      tripId,
      radiusKm,
      radiusIndex,
      totalRadii: TripsService.SEARCH_RADII_KM.length,
    });

    // Search for driver in this radius (filter by cargo type equipment compatibility)
    const driver = await this.findNearestDriverInRadius(trip.originLat, trip.originLng, radiusKm, trip.cargoType as CargoType);

    if (driver) {
      // Found a driver — assign (only set assignedDriverId, driverId is set on accept)
      trip.status = TripStatus.ASSIGNED;
      trip.assignedDriverId = driver.id;
      trip.searchRadiusIndex = radiusIndex;
      trip.assignmentExpiresAt = new Date(Date.now() + ASSIGNMENT_TIMEOUT_MS);
      await this.tripRepository.save(trip);

      await this.attachRequesterTripCount(trip);

      this.eventsGateway.emitToDriver(driver.id, 'trip:assigned', trip);
      this.eventsGateway.emitToUser(trip.requesterId, 'trip:assigned', trip);
      this.eventsGateway.emitTripUpdate(tripId, 'trip:assigned', trip);

      this.pushNotificationService.sendToUser(driver.id, {
        title: 'Nueva solicitud de viaje',
        body: `${trip.originAddress} → ${trip.destinationAddress}`,
        data: { tripId, type: 'trip:assigned' },
      });

      this.eventsGateway.emitToUser(trip.requesterId, 'trip:driver_notified', {
        tripId,
        driver: {
          id: driver.id,
          name: `${driver.firstName || ''} ${driver.lastName || ''}`.trim(),
          avatarUrl: driver.avatarUrl || null,
        },
      });

      if (this.tripsQueue) {
        await this.tripsQueue.add(
          'assignment-timeout',
          { tripId },
          { delay: ASSIGNMENT_TIMEOUT_MS, jobId: `assignment-${tripId}` },
        );
      }

      this.logger.log(`Trip ${tripId} assigned to driver ${driver.id} at radius ${radiusKm}km`);
    } else {
      // No driver in this radius — schedule next expansion
      trip.searchRadiusIndex = radiusIndex;
      await this.tripRepository.save(trip);

      const nextIndex = radiusIndex + 1;
      if (nextIndex < TripsService.SEARCH_RADII_KM.length && this.tripsQueue) {
        try {
          await this.tripsQueue.add(
            'radius-expansion',
            { tripId, radiusIndex: nextIndex },
            { delay: TripsService.RADIUS_EXPANSION_DELAY_MS, jobId: `radius-${tripId}-${nextIndex}` },
          );
          this.logger.log(`Trip ${tripId} no driver in ${radiusKm}km, scheduling expansion to index ${nextIndex}`);
        } catch (error: any) {
          this.logger.error(`Failed to schedule next radius expansion: ${error.message}`);
          await this.doBroadcast(trip);
        }
      } else {
        // Last radius or no queue — broadcast
        await this.doBroadcast(trip);
        this.logger.log(`Trip ${tripId} all radii exhausted, broadcasting`);
      }
    }
  }

  // Helper: count completed trips for a requester
  private async getRequesterTripCount(requesterId: string): Promise<number> {
    return this.tripRepository.count({
      where: { requesterId, status: TripStatus.DELIVERED },
    });
  }

  // Helper: attach requesterTripCount to trip object for emission
  private async attachRequesterTripCount(trip: Trip): Promise<void> {
    const count = await this.getRequesterTripCount(trip.requesterId);
    (trip as any).requesterTripCount = count;
  }

  // Helper: broadcast trip to all drivers
  private async doBroadcast(trip: Trip): Promise<void> {
    trip.status = TripStatus.BROADCAST;
    trip.driver = null;
    trip.driverId = null;
    trip.assignedDriverId = null;
    trip.assignmentExpiresAt = null;
    trip.broadcastAt = new Date();
    const savedTrip = await this.tripRepository.save(trip);

    await this.attachRequesterTripCount(savedTrip);

    this.eventsGateway.emitToAllDrivers('trip:broadcast', savedTrip);
    this.eventsGateway.emitToUser(trip.requesterId, 'trip:broadcast', savedTrip);
    this.eventsGateway.emitTripUpdate(trip.id, 'trip:broadcast', savedTrip);

    this.pushNotificationService.sendToAllDrivers({
      title: 'Viaje disponible',
      body: `${trip.originAddress} → ${trip.destinationAddress}`,
      data: { tripId: trip.id, type: 'trip:broadcast' },
    });
  }

  async updateTrip(tripId: string, userId: string, dto: UpdateTripDto): Promise<Trip> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    if (trip.requesterId !== userId) {
      throw new ForbiddenException('Solo el solicitante puede editar el viaje');
    }

    const editableStatuses = [TripStatus.PENDING, TripStatus.ASSIGNED, TripStatus.BROADCAST];
    if (!editableStatuses.includes(trip.status)) {
      throw new BadRequestException(
        `No se puede editar un viaje en estado ${trip.status}`,
      );
    }

    // Check if origin or destination changed (need route recalculation)
    const originChanged =
      (dto.originLat !== undefined && dto.originLat !== trip.originLat) ||
      (dto.originLng !== undefined && dto.originLng !== trip.originLng);
    const destinationChanged =
      (dto.destinationLat !== undefined && dto.destinationLat !== trip.destinationLat) ||
      (dto.destinationLng !== undefined && dto.destinationLng !== trip.destinationLng);

    // Update only present fields
    if (dto.originAddress !== undefined) trip.originAddress = dto.originAddress;
    if (dto.originLat !== undefined) trip.originLat = dto.originLat;
    if (dto.originLng !== undefined) trip.originLng = dto.originLng;
    if (dto.originCity !== undefined) trip.originCity = dto.originCity;
    if (dto.originState !== undefined) trip.originState = dto.originState;
    if (dto.destinationAddress !== undefined) trip.destinationAddress = dto.destinationAddress;
    if (dto.destinationLat !== undefined) trip.destinationLat = dto.destinationLat;
    if (dto.destinationLng !== undefined) trip.destinationLng = dto.destinationLng;
    if (dto.destinationCity !== undefined) trip.destinationCity = dto.destinationCity;
    if (dto.destinationState !== undefined) trip.destinationState = dto.destinationState;
    if (dto.cargoDescription !== undefined) trip.cargoDescription = dto.cargoDescription;
    if (dto.cargoType !== undefined) trip.cargoType = dto.cargoType;
    if (dto.transportType !== undefined) trip.transportType = dto.transportType;
    if (dto.cargoWeight !== undefined) trip.cargoWeight = dto.cargoWeight;
    if (dto.cargoWeightUnit !== undefined) trip.cargoWeightUnit = dto.cargoWeightUnit;
    if (dto.cargoPallets !== undefined) trip.cargoPallets = dto.cargoPallets;
    if (dto.cargoFragile !== undefined) trip.cargoFragile = dto.cargoFragile;
    if (dto.cargoInstructions !== undefined) trip.cargoInstructions = dto.cargoInstructions;
    if (dto.scheduledPickupAt !== undefined) trip.scheduledPickupAt = dto.scheduledPickupAt ? new Date(dto.scheduledPickupAt) : null;
    if (dto.estimatedDeliveryAt !== undefined) trip.estimatedDeliveryAt = dto.estimatedDeliveryAt ? new Date(dto.estimatedDeliveryAt) : null;

    // Recalculate route and pricing if origin or destination changed
    if (originChanged || destinationChanged) {
      const directions = await this.geolocationService.getDirections(
        trip.originLat,
        trip.originLng,
        trip.destinationLat,
        trip.destinationLng,
      );

      const distanceKm = directions?.distance || 0;
      if (distanceKm <= 0) {
        throw new BadRequestException(
          'No se pudo calcular la distancia del viaje. Verifica las direcciones ingresadas.',
        );
      }

      trip.distanceKm = distanceKm;
      trip.estimatedDuration = directions?.durationText || null;

      const tariff = trip.transportType
        ? await this.tariffService.getTariffForTransport(trip.transportType)
        : null;
      const pricePerKm = tariff ? Number(tariff.pricePerKm) : 50;
      const commissionRate = tariff ? Number(tariff.commissionRate) : 0.15;
      trip.price = Math.round(distanceKm * pricePerKm);
      trip.commission = Math.round(trip.price * commissionRate);
      trip.driverPayout = trip.price - trip.commission;
    }

    const savedTrip = await this.tripRepository.save(trip);

    // Reload with relations
    const fullTrip = await this.tripRepository.findOne({
      where: { id: savedTrip.id },
      relations: ['requester', 'driver'],
    });

    // Notify requester
    this.eventsGateway.emitToUser(userId, 'trip:updated', fullTrip);

    // Notify assigned driver if exists
    if (fullTrip!.assignedDriverId) {
      this.eventsGateway.emitToDriver(fullTrip!.assignedDriverId, 'trip:updated', fullTrip);
    }

    this.logger.log(`Trip ${tripId} updated by requester ${userId}`);

    return fullTrip!;
  }

  // ==================== TEST HELPERS ====================

  private static readonly TEST_DRIVERS = [
    {
      email: 'chofer1@test.com',
      firstName: 'Carlos',
      lastName: 'Rodríguez',
      phone: '+5491111111111',
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
      latitude: -34.8550,
      longitude: -58.3200,
      address: 'Ezeiza, Buenos Aires',
      dni: '34555555',
      cuit: '20345555559',
    },
  ];

  async cleanupTestTrips(): Promise<{ deleted: number }> {
    const result = await this.tripRepository.delete({
      status: TripStatus.BROADCAST,
    });

    const resultPending = await this.tripRepository.delete({
      status: TripStatus.PENDING,
    });

    const resultAssigned = await this.tripRepository.delete({
      status: TripStatus.ASSIGNED,
    });

    const total = (result.affected || 0) + (resultPending.affected || 0) + (resultAssigned.affected || 0);
    this.logger.log(`Cleanup: ${total} test trips deleted`);

    return { deleted: total };
  }

  async seedTestDrivers(): Promise<{ created: number; updated: number; drivers: any[] }> {
    this.logger.log('Seeding test drivers...');
    const hashedPassword = await bcrypt.hash('Test1234', 10);
    let created = 0;
    let updated = 0;

    for (const driverData of TripsService.TEST_DRIVERS) {
      const existing = await this.userRepository.findOne({
        where: { email: driverData.email },
      });

      if (existing) {
        existing.latitude = driverData.latitude;
        existing.longitude = driverData.longitude;
        existing.address = driverData.address;
        existing.estado = UserStatus.VERIFIED;
        existing.rol = UserRole.CHOFER;
        existing.firstName = driverData.firstName;
        existing.lastName = driverData.lastName;
        await this.userRepository.save(existing);
        updated++;
      } else {
        const user = this.userRepository.create({
          email: driverData.email,
          password: hashedPassword,
          phone: driverData.phone,
          firstName: driverData.firstName,
          lastName: driverData.lastName,
          rol: UserRole.CHOFER,
          estado: UserStatus.VERIFIED,
          latitude: driverData.latitude,
          longitude: driverData.longitude,
          address: driverData.address,
          dni: driverData.dni,
          cuit: driverData.cuit,
          emailVerified: true,
          phoneVerified: true,
        });
        await this.userRepository.save(user);
        created++;
      }
    }

    // Retornar conductores disponibles
    const drivers = await this.userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.email', 'user.firstName', 'user.lastName', 'user.latitude', 'user.longitude', 'user.address', 'user.estado'])
      .where('user.rol = :role', { role: UserRole.CHOFER })
      .andWhere('user.estado != :banned', { banned: UserStatus.BANNED })
      .orderBy('user.email', 'ASC')
      .getMany();

    this.logger.log(`Seed completed: ${created} created, ${updated} updated. Total available drivers: ${drivers.length}`);

    return {
      created,
      updated,
      drivers: drivers.map((d) => ({
        id: d.id,
        email: d.email,
        name: `${d.firstName} ${d.lastName}`,
        location: `${d.latitude}, ${d.longitude}`,
        address: d.address,
      })),
    };
  }
}
