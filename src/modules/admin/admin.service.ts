import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Trip } from '../trips/entities/trip.entity';
import { User } from '../users/entities/user.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { Port } from '../ports/entities/port.entity';
import { WalletTransaction } from '../wallet/entities/wallet-transaction.entity';
import { WithdrawalRequest } from '../wallet/entities/withdrawal-request.entity';
import { TripStatus } from '../../shared/enums/trip-status.enum';
import { UserRole } from '../../shared/enums/user-role.enum';
import { UserStatus } from '../../shared/enums/user-status.enum';
import { VehicleStatus } from '../../shared/enums/vehicle-status.enum';
import { WithdrawalStatus } from '../../shared/enums/withdrawal-status.enum';
import { TripsService } from '../trips/trips.service';
import { WalletService } from '../wallet/wallet.service';
import { PushNotificationService } from '../notifications/push-notification.service';
import { ConfirmFleteReceivedDto } from '../trips/dto/confirm-flete.dto';
import { ProcessWithdrawalDto, RejectWithdrawalDto } from '../wallet/dto/process-withdrawal.dto';
import { CreatePortUserDto } from './dto/create-port-user.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
    @InjectRepository(WalletTransaction)
    private readonly walletTransactionRepository: Repository<WalletTransaction>,
    @InjectRepository(WithdrawalRequest)
    private readonly withdrawalRepository: Repository<WithdrawalRequest>,
    @InjectRepository(Port)
    private readonly portRepository: Repository<Port>,
    private readonly tripsService: TripsService,
    private readonly walletService: WalletService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  async getDashboardKpis() {
    const totalTrips = await this.tripRepository.count();

    const activeDrivers = await this.userRepository.count({
      where: { rol: UserRole.CHOFER, isAvailable: true },
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRevenue = await this.tripRepository
      .createQueryBuilder('trip')
      .select('COALESCE(SUM(trip.price), 0)', 'total')
      .where('trip.status = :status', { status: TripStatus.DELIVERED })
      .andWhere('trip.delivered_at >= :start', { start: startOfMonth })
      .getRawOne();

    const pendingTrips = await this.tripRepository.count({
      where: [
        { status: TripStatus.PENDING },
        { status: TripStatus.ASSIGNED },
        { status: TripStatus.BROADCAST },
      ],
    });

    // Pending flete count
    const pendingFleteCount = await this.tripRepository
      .createQueryBuilder('trip')
      .where('trip.status = :status', { status: TripStatus.DELIVERED })
      .andWhere("(trip.payment_status = 'pending_flete' OR trip.payment_status = 'pending')")
      .getCount();

    // Pending withdrawals count
    const pendingWithdrawals = await this.withdrawalRepository.count({
      where: { status: WithdrawalStatus.PENDING },
    });

    // Total commissions earned
    const monthCommission = await this.tripRepository
      .createQueryBuilder('trip')
      .select('COALESCE(SUM(trip.commission), 0)', 'total')
      .where('trip.status = :status', { status: TripStatus.DELIVERED })
      .andWhere("trip.payment_status = 'driver_credited'")
      .andWhere('trip.flete_received_at >= :start', { start: startOfMonth })
      .getRawOne();

    return {
      totalTrips,
      activeDrivers,
      monthRevenue: parseFloat(monthRevenue?.total || '0'),
      pendingTrips,
      pendingFleteCount,
      pendingWithdrawals,
      monthCommission: parseFloat(monthCommission?.total || '0'),
    };
  }

  async getTripsByMonth() {
    const result = await this.tripRepository
      .createQueryBuilder('trip')
      .select("TO_CHAR(trip.created_at, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where("trip.created_at >= NOW() - INTERVAL '12 months'")
      .groupBy("TO_CHAR(trip.created_at, 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany();

    return result.map((r) => ({
      month: r.month,
      count: parseInt(r.count, 10),
    }));
  }

  async getRevenueTrend() {
    const result = await this.tripRepository
      .createQueryBuilder('trip')
      .select("TO_CHAR(trip.delivered_at, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(trip.price), 0)', 'revenue')
      .addSelect('COALESCE(SUM(trip.commission), 0)', 'commission')
      .where('trip.status = :status', { status: TripStatus.DELIVERED })
      .andWhere("trip.delivered_at >= NOW() - INTERVAL '12 months'")
      .groupBy("TO_CHAR(trip.delivered_at, 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany();

    return result.map((r) => ({
      month: r.month,
      revenue: parseFloat(r.revenue),
      commission: parseFloat(r.commission),
    }));
  }

  async getTripsByStatus() {
    const result = await this.tripRepository
      .createQueryBuilder('trip')
      .select('trip.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('trip.status')
      .getRawMany();

    return result.map((r) => ({
      status: r.status,
      count: parseInt(r.count, 10),
    }));
  }

  async findAllTrips(filters: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    transportType?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const skip = (page - 1) * limit;

    const qb = this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.requester', 'requester')
      .leftJoinAndSelect('trip.driver', 'driver');

    if (filters.status) {
      qb.andWhere('trip.status = :status', { status: filters.status });
    }

    if (filters.transportType) {
      qb.andWhere('trip.transport_type = :transportType', {
        transportType: filters.transportType,
      });
    }

    if (filters.dateFrom) {
      qb.andWhere('trip.created_at >= :dateFrom', {
        dateFrom: new Date(filters.dateFrom),
      });
    }

    if (filters.dateTo) {
      qb.andWhere('trip.created_at <= :dateTo', {
        dateTo: new Date(filters.dateTo),
      });
    }

    if (filters.search) {
      qb.andWhere(
        '(trip.origin_address ILIKE :search OR trip.destination_address ILIKE :search OR trip.origin_city ILIKE :search OR trip.destination_city ILIKE :search OR CAST(trip.id AS TEXT) ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    qb.orderBy('trip.createdAt', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findTripById(id: string) {
    return this.tripRepository.findOne({
      where: { id },
      relations: ['requester', 'driver'],
    });
  }

  // ---- Flete / Payment ----

  async getTripsPendingFlete(filters?: { page?: number; limit?: number }) {
    return this.tripsService.getTripsPendingFlete(filters);
  }

  async confirmFleteReceived(tripId: string, dto: ConfirmFleteReceivedDto) {
    return this.tripsService.confirmFleteReceived(
      tripId,
      dto.fleteAmount,
      dto.adminNote,
    );
  }

  // ---- Vehicles ----

  async findAllVehicles(filters: {
    page?: number;
    limit?: number;
    type?: string;
    search?: string;
    approvalStatus?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const skip = (page - 1) * limit;

    const qb = this.vehicleRepository
      .createQueryBuilder('vehicle')
      .leftJoinAndSelect('vehicle.user', 'user');

    if (filters.type) {
      qb.andWhere('vehicle.type = :type', { type: filters.type });
    }

    if (filters.approvalStatus) {
      qb.andWhere('vehicle.approval_status = :approvalStatus', {
        approvalStatus: filters.approvalStatus,
      });
    }

    if (filters.search) {
      qb.andWhere(
        '(vehicle.plate ILIKE :search OR vehicle.brand ILIKE :search OR vehicle.model ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    qb.orderBy('vehicle.createdAt', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findVehicleById(id: string) {
    return this.vehicleRepository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  private getVehicleMissingFields(vehicle: Vehicle): string[] {
    const requiredFields: { field: string; label: string }[] = [
      { field: 'insurancePhotoUrl', label: 'Foto póliza de seguro' },
      { field: 'insuranceExpiryDate', label: 'Fecha vencimiento seguro' },
      { field: 'licenseFrontUrl', label: 'Foto frente licencia' },
      { field: 'licenseBackUrl', label: 'Foto dorso licencia' },
      { field: 'licenseExpiryDate', label: 'Fecha vencimiento licencia' },
      { field: 'artPhotoUrl', label: 'Foto ART' },
      { field: 'artExpiryDate', label: 'Fecha vencimiento ART' },
      { field: 'rcPhotoUrl', label: 'Foto Responsabilidad Civil' },
      { field: 'rcExpiryDate', label: 'Fecha vencimiento RC' },
    ];

    return requiredFields
      .filter(({ field }) => !vehicle[field])
      .map(({ label }) => label);
  }

  async getApprovalReadiness(id: string) {
    const vehicle = await this.vehicleRepository.findOne({ where: { id } });
    if (!vehicle) {
      throw new NotFoundException('Vehículo no encontrado');
    }

    const missingFields = this.getVehicleMissingFields(vehicle);
    const totalRequired = 9;

    return {
      vehicleId: id,
      isReady: missingFields.length === 0,
      missingFields,
      totalRequired,
      completedCount: totalRequired - missingFields.length,
    };
  }

  async approveVehicle(id: string) {
    const vehicle = await this.vehicleRepository.findOne({ where: { id } });
    if (!vehicle) return null;

    const missingFields = this.getVehicleMissingFields(vehicle);
    if (missingFields.length > 0) {
      throw new BadRequestException({
        message: 'No se puede aprobar el vehículo. Faltan documentos obligatorios.',
        missingFields,
      });
    }

    vehicle.approvalStatus = VehicleStatus.APPROVED;
    vehicle.rejectionReason = null;
    return this.vehicleRepository.save(vehicle);
  }

  async rejectVehicle(id: string, reason?: string) {
    const vehicle = await this.vehicleRepository.findOne({ where: { id } });
    if (!vehicle) return null;

    vehicle.approvalStatus = VehicleStatus.REJECTED;
    vehicle.rejectionReason = reason || null;
    return this.vehicleRepository.save(vehicle);
  }

  // ---- Wallets ----

  async findDriverWallets(filters: { page?: number; limit?: number; search?: string }) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const skip = (page - 1) * limit;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.firstName',
        'user.lastName',
        'user.phone',
        'user.walletBalance',
        'user.cbu',
        'user.bankAlias',
        'user.bankName',
        'user.bankHolderName',
      ])
      .where('user.rol = :role', { role: UserRole.CHOFER });

    if (filters.search) {
      qb.andWhere(
        '(user.email ILIKE :search OR user.first_name ILIKE :search OR user.last_name ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    qb.orderBy('user.walletBalance', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    const driversWithLastTx = await Promise.all(
      data.map(async (driver) => {
        const lastTx = await this.walletTransactionRepository.findOne({
          where: { userId: driver.id },
          order: { createdAt: 'DESC' },
        });
        return {
          id: driver.id,
          email: driver.email,
          firstName: driver.firstName,
          lastName: driver.lastName,
          phone: driver.phone,
          walletBalance: Number(driver.walletBalance),
          cbu: driver.cbu,
          bankAlias: driver.bankAlias,
          bankName: driver.bankName,
          bankHolderName: driver.bankHolderName,
          lastTransactionAt: lastTx?.createdAt || null,
        };
      }),
    );

    return {
      data: driversWithLastTx,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findWalletTransactions(
    userId: string,
    filters: { page?: number; limit?: number },
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await this.walletTransactionRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ---- Withdrawals ----

  async findAllWithdrawals(filters: { page?: number; limit?: number; status?: string }) {
    return this.walletService.findAllWithdrawals(filters);
  }

  async processWithdrawal(withdrawalId: string, dto: ProcessWithdrawalDto) {
    const withdrawal = await this.walletService.processWithdrawal(
      withdrawalId,
      dto.transferReference,
      dto.adminNote,
    );

    // Notify driver
    this.pushNotificationService.sendToUser(withdrawal.userId, {
      title: 'Retiro procesado',
      body: `Tu retiro de $${Number(withdrawal.amount).toLocaleString('es-AR')} fue transferido`,
      data: { withdrawalId, type: 'withdrawal:completed' },
    });

    return withdrawal;
  }

  // ---- Incidents ----

  async getIncidents(filters: { page?: number; limit?: number; status?: string; type?: string }) {
    return this.tripsService.getAllIncidents(filters);
  }

  async resolveIncident(incidentId: string, adminNotes?: string) {
    return this.tripsService.resolveIncident(incidentId, adminNotes);
  }

  async rejectWithdrawal(withdrawalId: string, dto: RejectWithdrawalDto) {
    const withdrawal = await this.walletService.rejectWithdrawal(
      withdrawalId,
      dto.reason,
      dto.adminNote,
    );

    // Notify driver
    this.pushNotificationService.sendToUser(withdrawal.userId, {
      title: 'Retiro rechazado',
      body: `Tu retiro fue rechazado. Los fondos fueron devueltos a tu wallet.`,
      data: { withdrawalId, type: 'withdrawal:rejected' },
    });

    return withdrawal;
  }

  // ---- Drivers live map (CRM) ----

  /**
   * Lista de choferes con ubicación conocida para el mapa en vivo.
   * @param status   'all' | 'in_transit' (default 'all')
   * @param sinceMs  filtrar por lastLocationAt >= now - sinceMs (opcional)
   */
  async getDriverLocations(filters: { status?: 'all' | 'in_transit'; sinceMs?: number }) {
    const status = filters.status ?? 'all';

    const qb = this.userRepository
      .createQueryBuilder('user')
      .where('user.rol = :rol', { rol: UserRole.CHOFER })
      .andWhere('user.latitude IS NOT NULL')
      .andWhere('user.longitude IS NOT NULL');

    if (filters.sinceMs && filters.sinceMs > 0) {
      const since = new Date(Date.now() - filters.sinceMs);
      qb.andWhere('user.lastLocationAt >= :since', { since });
    }

    const drivers = await qb.getMany();

    const driverIds = drivers.map((d) => d.id);
    const activeTrips =
      driverIds.length > 0
        ? await this.tripRepository
            .createQueryBuilder('trip')
            .where('trip.driverId IN (:...driverIds)', { driverIds })
            .andWhere('trip.status = :status', { status: TripStatus.IN_TRANSIT })
            .getMany()
        : [];

    const activeByDriver = new Map<string, Trip>();
    for (const t of activeTrips) {
      if (t.driverId) activeByDriver.set(t.driverId, t);
    }

    const result = drivers.map((d) => {
      const t = activeByDriver.get(d.id);
      return {
        driverId: d.id,
        firstName: d.firstName,
        lastName: d.lastName,
        latitude: d.latitude !== null ? Number(d.latitude) : null,
        longitude: d.longitude !== null ? Number(d.longitude) : null,
        lastLocationAt: d.lastLocationAt,
        hasActiveTrip: !!t,
        activeTripId: t?.id ?? null,
      };
    });

    if (status === 'in_transit') {
      return result.filter((r) => r.hasActiveTrip);
    }
    return result;
  }

  /**
   * Snapshot completo de un chofer para el side panel del mapa CRM.
   */
  async getDriverSnapshot(driverId: string) {
    const driver = await this.userRepository.findOne({
      where: { id: driverId, rol: UserRole.CHOFER },
    });
    if (!driver) throw new NotFoundException('Chofer no encontrado');

    const [vehicles, completedTripsCount, activeTrip] = await Promise.all([
      this.vehicleRepository.find({
        where: { userId: driverId },
        order: { createdAt: 'ASC' },
      }),
      this.tripRepository.count({
        where: { driverId, status: TripStatus.DELIVERED },
      }),
      this.tripRepository.findOne({
        where: { driverId, status: TripStatus.IN_TRANSIT },
      }),
    ]);

    const primaryVehicle = vehicles[0] ?? null;

    return {
      driverId: driver.id,
      firstName: driver.firstName,
      lastName: driver.lastName,
      email: driver.email,
      phone: driver.phone ?? null,
      estado: driver.estado,
      walletBalance: Number(driver.walletBalance ?? 0),
      registeredAt: driver.createdAt,
      lastLocationAt: driver.lastLocationAt,
      latitude: driver.latitude !== null ? Number(driver.latitude) : null,
      longitude: driver.longitude !== null ? Number(driver.longitude) : null,
      completedTrips: completedTripsCount,
      vehicle: primaryVehicle
        ? {
            id: primaryVehicle.id,
            plate: primaryVehicle.plate,
            brand: primaryVehicle.brand,
            model: primaryVehicle.model,
            year: primaryVehicle.year,
            type: primaryVehicle.type,
            approvalStatus: primaryVehicle.approvalStatus,
          }
        : null,
      activeTrip: activeTrip
        ? {
            id: activeTrip.id,
            status: activeTrip.status,
            originAddress: (activeTrip as any).originAddress ?? null,
            destinationAddress: (activeTrip as any).destinationAddress ?? null,
            destinationPortId: activeTrip.destinationPortId ?? null,
          }
        : null,
    };
  }

  // ---- Port User Management ----

  async createPortUser(portId: string, dto: CreatePortUserDto): Promise<User> {
    const port = await this.portRepository.findOne({ where: { id: portId } });
    if (!port) throw new NotFoundException('Puerto no encontrado');

    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('El email ya está registrado');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({
      email: dto.email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      rol: UserRole.PUERTO,
      estado: UserStatus.VERIFIED,
      emailVerified: true,
      portId,
    });

    return this.userRepository.save(user);
  }

  async getPortUsers(portId: string): Promise<User[]> {
    return this.userRepository.find({
      where: { portId, rol: UserRole.PUERTO },
      select: ['id', 'email', 'firstName', 'lastName', 'phone', 'estado', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async assignUserToPort(userId: string, portId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const port = await this.portRepository.findOne({ where: { id: portId } });
    if (!port) throw new NotFoundException('Puerto no encontrado');
    user.portId = portId;
    return this.userRepository.save(user);
  }

  async deactivateUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    user.estado = UserStatus.BANNED;
    return this.userRepository.save(user);
  }
}
