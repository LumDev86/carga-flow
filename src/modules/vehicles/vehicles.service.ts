import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle } from './entities/vehicle.entity';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { StorageService } from '../../common/storage/storage.service';

type DocumentField = 'insurancePhotoUrl' | 'licenseFrontUrl' | 'licenseBackUrl';

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
    private readonly storageService: StorageService,
  ) {}

  async create(userId: string, dto: CreateVehicleDto): Promise<Vehicle> {
    // Check if plate already exists
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

    return this.vehicleRepository.save(vehicle);
  }

  async findMyVehicles(userId: string): Promise<Vehicle[]> {
    return this.vehicleRepository.find({
      where: { userId },
      order: { isActive: 'DESC', createdAt: 'DESC' },
    });
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

    // If plate is being changed, check uniqueness
    if (dto.plate && dto.plate !== vehicle.plate) {
      const existing = await this.vehicleRepository.findOne({
        where: { plate: dto.plate },
      });
      if (existing) {
        throw new BadRequestException(`La patente ${dto.plate} ya está registrada`);
      }
    }

    Object.assign(vehicle, dto);
    return this.vehicleRepository.save(vehicle);
  }

  async remove(id: string, userId: string): Promise<void> {
    const vehicle = await this.findOne(id, userId);
    await this.vehicleRepository.remove(vehicle);
  }

  async uploadDocument(
    vehicleId: string,
    userId: string,
    field: DocumentField,
    file: Express.Multer.File,
  ): Promise<Vehicle> {
    const vehicle = await this.findOne(vehicleId, userId);

    // Delete old file if exists
    if (vehicle[field]) {
      await this.storageService.deleteFile(vehicle[field]).catch(() => {});
    }

    const folder = `vehicles/${vehicleId}`;
    const url = await this.storageService.uploadFile(file, folder);

    vehicle[field] = url;
    return this.vehicleRepository.save(vehicle);
  }

  async setActive(id: string, userId: string): Promise<Vehicle> {
    // Deactivate all user vehicles
    await this.vehicleRepository.update(
      { userId },
      { isActive: false },
    );

    // Activate the selected one
    const vehicle = await this.findOne(id, userId);
    vehicle.isActive = true;
    return this.vehicleRepository.save(vehicle);
  }
}
