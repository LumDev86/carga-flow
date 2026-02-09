import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Vehicle } from './entities/vehicle.entity';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { StorageService } from '../../common/storage/storage.service';

type DocumentField = 'insurancePhotoUrl' | 'licenseFrontUrl' | 'licenseBackUrl';

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const cacheKey = (userId: string) => `vehicles:user:${userId}`;

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
    private readonly storageService: StorageService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private async invalidateCache(userId: string): Promise<void> {
    await this.cacheManager.del(cacheKey(userId));
  }

  async create(userId: string, dto: CreateVehicleDto): Promise<Vehicle> {
    const existing = await this.vehicleRepository.findOne({
      where: { plate: dto.plate },
    });
    if (existing) {
      throw new BadRequestException(`La patente ${dto.plate} ya está registrada`);
    }

    const vehicle = this.vehicleRepository.create({
      ...dto,
      userId,
    });

    const saved = await this.vehicleRepository.save(vehicle);
    await this.invalidateCache(userId);
    return saved;
  }

  async findMyVehicles(userId: string): Promise<Vehicle[]> {
    // Check cache first
    const cached = await this.cacheManager.get<Vehicle[]>(cacheKey(userId));
    if (cached) return cached;

    const vehicles = await this.vehicleRepository.find({
      where: { userId },
      order: { isActive: 'DESC', createdAt: 'DESC' },
    });

    await this.cacheManager.set(cacheKey(userId), vehicles, CACHE_TTL);
    return vehicles;
  }

  async findOne(id: string, userId: string): Promise<Vehicle> {
    const vehicle = await this.vehicleRepository.findOne({
      where: { id },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehículo no encontrado');
    }

    if (vehicle.userId !== userId) {
      throw new ForbiddenException('No tienes acceso a este vehículo');
    }

    return vehicle;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateVehicleDto,
  ): Promise<Vehicle> {
    const vehicle = await this.findOne(id, userId);

    if (dto.plate && dto.plate !== vehicle.plate) {
      const existing = await this.vehicleRepository.findOne({
        where: { plate: dto.plate },
      });
      if (existing) {
        throw new BadRequestException(`La patente ${dto.plate} ya está registrada`);
      }
    }

    Object.assign(vehicle, dto);
    const saved = await this.vehicleRepository.save(vehicle);
    await this.invalidateCache(userId);
    return saved;
  }

  async remove(id: string, userId: string): Promise<void> {
    const vehicle = await this.findOne(id, userId);
    await this.vehicleRepository.remove(vehicle);
    await this.invalidateCache(userId);
  }

  async uploadDocument(
    vehicleId: string,
    userId: string,
    field: DocumentField,
    file: Express.Multer.File,
  ): Promise<Vehicle> {
    const vehicle = await this.findOne(vehicleId, userId);

    if (vehicle[field]) {
      await this.storageService.deleteFile(vehicle[field]).catch(() => {});
    }

    const folder = `vehicles/${vehicleId}`;
    const url = await this.storageService.uploadFile(file, folder);

    vehicle[field] = url;
    const saved = await this.vehicleRepository.save(vehicle);
    await this.invalidateCache(userId);
    return saved;
  }

  async setActive(id: string, userId: string): Promise<Vehicle> {
    await this.vehicleRepository.update(
      { userId },
      { isActive: false },
    );

    const vehicle = await this.findOne(id, userId);
    vehicle.isActive = true;
    const saved = await this.vehicleRepository.save(vehicle);
    await this.invalidateCache(userId);
    return saved;
  }
}
