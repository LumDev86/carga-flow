import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, Between } from 'typeorm';
import { Trip } from '../trips/entities/trip.entity';
import { User } from '../users/entities/user.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { TripStatus } from '../../shared/enums/trip-status.enum';
import { UserRole } from '../../shared/enums/user-role.enum';
import { VehicleStatus } from '../../shared/enums/vehicle-status.enum';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
  ) {}

  async getDashboardKpis() {
    const totalTrips = await this.tripRepository.count();

    const activeDrivers = await this.userRepository.count({
      where: { rol: UserRole.CHOFER, isAvailable: true },
    });

    // Revenue this month
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

    return {
      totalTrips,
      activeDrivers,
      monthRevenue: parseFloat(monthRevenue?.total || '0'),
      pendingTrips,
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

  async approveVehicle(id: string) {
    const vehicle = await this.vehicleRepository.findOne({ where: { id } });
    if (!vehicle) return null;

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
}
