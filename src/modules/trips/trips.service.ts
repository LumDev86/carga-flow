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
import { CreateTripDto } from './dto/create-trip.dto';
import { CompleteTripDto } from './dto/complete-trip.dto';
import { RateTripDto } from './dto/rate-trip.dto';
import { TripFiltersDto } from './dto/trip-filters.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { TripStatus } from '../../shared/enums/trip-status.enum';
import { UserRole } from '../../shared/enums/user-role.enum';
import { UserStatus } from '../../shared/enums/user-status.enum';

const BASE_PRICE_PER_KM = 50;
const COMMISSION_RATE = 0.15;
const ASSIGNMENT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

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

    // Calculate pricing
    const price = Math.round(distanceKm * BASE_PRICE_PER_KM);
    const commission = Math.round(price * COMMISSION_RATE);
    const driverPayout = price - commission;

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
      status: TripStatus.PENDING,
    });

    this.logger.log(`Trip entity created, requesterId: ${trip.requesterId}, requester.id: ${trip.requester?.id}`);

    const savedTrip = await this.tripRepository.save(trip);

    // Find nearest driver
    const nearestDriver = await this.findNearestDriver(dto.originLat, dto.originLng);

    if (nearestDriver) {
      // Assign to nearest driver
      savedTrip.status = TripStatus.ASSIGNED;
      savedTrip.driver = nearestDriver;
      savedTrip.assignedDriverId = nearestDriver.id;
      savedTrip.assignmentExpiresAt = new Date(Date.now() + ASSIGNMENT_TIMEOUT_MS);
      await this.tripRepository.save(savedTrip);

      // Emit to assigned driver
      this.eventsGateway.emitToDriver(nearestDriver.id, 'trip:assigned', savedTrip);

      // Schedule timeout job (if queue is available)
      if (this.tripsQueue) {
        await this.tripsQueue.add(
          'assignment-timeout',
          { tripId: savedTrip.id },
          { delay: ASSIGNMENT_TIMEOUT_MS, jobId: `assignment-${savedTrip.id}` },
        );
      }

      this.logger.log(`Trip ${savedTrip.id} assigned to driver ${nearestDriver.id}`);
    } else {
      // No driver found, broadcast
      savedTrip.status = TripStatus.BROADCAST;
      savedTrip.broadcastAt = new Date();
      await this.tripRepository.save(savedTrip);

      this.eventsGateway.emitToAllDrivers('trip:broadcast', savedTrip);
      this.logger.log(`Trip ${savedTrip.id} broadcasted to all drivers`);
    }

    // Reload with relations
    const result = await this.tripRepository.findOne({
      where: { id: savedTrip.id },
      relations: ['requester', 'driver'],
    });
    return result!;
  }

  async findNearestDriver(lat: number, lng: number): Promise<User | null> {
    // Haversine formula in SQL to find nearest driver
    const drivers = await this.userRepository
      .createQueryBuilder('user')
      .where('user.rol = :role', { role: UserRole.CHOFER })
      .andWhere('user.estado = :status', { status: UserStatus.VERIFIED })
      .andWhere('user.latitude IS NOT NULL')
      .andWhere('user.longitude IS NOT NULL')
      .andWhere(
        // No active trips
        `user.id NOT IN (
          SELECT t.driver_id FROM trips t
          WHERE t.driver_id IS NOT NULL
          AND t.status IN (:...activeStatuses)
        )`,
        { activeStatuses: [TripStatus.ACCEPTED, TripStatus.IN_TRANSIT] },
      )
      .addSelect(
        `(6371 * acos(cos(radians(:lat)) * cos(radians(user.latitude)) * cos(radians(user.longitude) - radians(:lng)) + sin(radians(:lat)) * sin(radians(user.latitude))))`,
        'distance',
      )
      .setParameter('lat', lat)
      .setParameter('lng', lng)
      .orderBy('distance', 'ASC')
      .limit(1)
      .getOne();

    return drivers || null;
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
        driverId,
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

    return {
      total: trips.length,
      pending: trips.filter((t) => t.status === TripStatus.PENDING).length,
      assigned: trips.filter((t) => t.status === TripStatus.ASSIGNED).length,
      broadcast: trips.filter((t) => t.status === TripStatus.BROADCAST).length,
      accepted: trips.filter((t) => t.status === TripStatus.ACCEPTED).length,
      inTransit: trips.filter((t) => t.status === TripStatus.IN_TRANSIT).length,
      delivered: trips.filter((t) => t.status === TripStatus.DELIVERED).length,
      cancelled: trips.filter((t) => t.status === TripStatus.CANCELLED).length,
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

    return trip;
  }

  async acceptTrip(tripId: string, driverId: string): Promise<Trip> {
    // Use transaction with locking to prevent race conditions
    return this.tripRepository.manager.transaction(async (manager) => {
      const trip = await manager.findOne(Trip, {
        where: { id: tripId },
        lock: { mode: 'pessimistic_write' },
      });

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
      trip.driver = { id: driverId } as User;
      trip.acceptedAt = new Date();

      const savedTrip = await manager.save(trip);

      // Remove timeout job if exists
      if (this.tripsQueue) {
        try {
          const job = await this.tripsQueue.getJob(`assignment-${tripId}`);
          if (job) await job.remove();
        } catch (e) {
          // Job may not exist
        }
      }

      // Reload with relations
      const fullTrip = await manager.findOne(Trip, {
        where: { id: savedTrip.id },
        relations: ['requester', 'driver'],
      });

      if (!fullTrip) {
        throw new NotFoundException('Error al cargar viaje');
      }

      // Notify requester
      this.eventsGateway.emitToUser(fullTrip.requesterId, 'trip:accepted', fullTrip);
      this.eventsGateway.emitTripUpdate(tripId, 'trip:accepted', fullTrip);

      this.logger.log(`Trip ${tripId} accepted by driver ${driverId}`);

      return fullTrip;
    });
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

    // Broadcast to all drivers
    trip.status = TripStatus.BROADCAST;
    trip.driver = null;
    trip.assignedDriverId = null;
    trip.assignmentExpiresAt = null;
    trip.broadcastAt = new Date();

    const savedTrip = await this.tripRepository.save(trip);

    // Remove timeout job
    if (this.tripsQueue) {
      try {
        const job = await this.tripsQueue.getJob(`assignment-${tripId}`);
        if (job) await job.remove();
      } catch (e) {
        // Job may not exist
      }
    }

    // Notify all drivers
    this.eventsGateway.emitToAllDrivers('trip:broadcast', savedTrip);
    // Notify the driver that their assignment expired
    this.eventsGateway.emitToDriver(driverId, 'trip:assignment_expired', savedTrip);

    this.logger.log(`Trip ${tripId} rejected by driver ${driverId}, now broadcast`);

    return savedTrip;
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

    const savedTrip = await this.tripRepository.save(trip);

    // Notify requester
    this.eventsGateway.emitToUser(trip.requesterId, 'trip:delivered', savedTrip);
    this.eventsGateway.emitTripUpdate(tripId, 'trip:delivered', savedTrip);

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

    if (trip.requesterId !== userId) {
      throw new ForbiddenException('Solo el solicitante puede cancelar el viaje');
    }

    const cancellableStatuses = [
      TripStatus.PENDING,
      TripStatus.ASSIGNED,
      TripStatus.BROADCAST,
      TripStatus.ACCEPTED,
    ];

    if (!cancellableStatuses.includes(trip.status)) {
      throw new BadRequestException(
        `No se puede cancelar un viaje en estado ${trip.status}`,
      );
    }

    const previousStatus = trip.status;
    const previousDriverId = trip.driverId;

    trip.status = TripStatus.CANCELLED;
    trip.cancelledAt = new Date();

    const savedTrip = await this.tripRepository.save(trip);

    // Remove timeout job if exists
    if (this.tripsQueue) {
      try {
        const job = await this.tripsQueue.getJob(`assignment-${tripId}`);
        if (job) await job.remove();
      } catch (e) {}
    }

    // Notify driver if assigned
    if (previousDriverId) {
      this.eventsGateway.emitToDriver(previousDriverId, 'trip:cancelled', savedTrip);
    }

    // If was broadcast, notify all drivers
    if (previousStatus === TripStatus.BROADCAST) {
      this.eventsGateway.emitToAllDrivers('trip:cancelled', savedTrip);
    }

    this.eventsGateway.emitTripUpdate(tripId, 'trip:cancelled', savedTrip);

    this.logger.log(`Trip ${tripId} cancelled by user ${userId}`);

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

    trip.rating = dto.rating;
    trip.ratingComments = dto.comments || null;

    return this.tripRepository.save(trip);
  }

  async updateDriverLocation(
    tripId: string,
    driverId: string,
    dto: UpdateLocationDto,
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

  // Called by Bull processor when assignment times out
  async broadcastTrip(tripId: string): Promise<void> {
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    });

    if (!trip || trip.status !== TripStatus.ASSIGNED) {
      return; // Already changed state
    }

    const previousDriverId = trip.driverId;

    trip.status = TripStatus.BROADCAST;
    trip.driver = null;
    trip.assignedDriverId = null;
    trip.assignmentExpiresAt = null;
    trip.broadcastAt = new Date();

    const savedTrip = await this.tripRepository.save(trip);

    // Notify previous driver
    if (previousDriverId) {
      this.eventsGateway.emitToDriver(
        previousDriverId,
        'trip:assignment_expired',
        savedTrip,
      );
    }

    // Broadcast to all drivers
    this.eventsGateway.emitToAllDrivers('trip:broadcast', savedTrip);

    this.logger.log(`Trip ${tripId} assignment expired, now broadcast`);
  }
}
