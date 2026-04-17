import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UserRole } from '../../../shared/enums/user-role.enum';
import { VehicleStatus } from '../../../shared/enums/vehicle-status.enum';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { PricingParameter } from '../../pricing/entities/pricing-parameter.entity';
import { UpdateVehicleFuelConfigDto } from '../dto/update-vehicle-fuel-config.dto';

/**
 * Allows a driver to set/update their vehicle's fuel consumption and type.
 * Large changes (>threshold%) require admin re-approval (anti-fraud,
 * POLICIES.md §6 / ADR-007).
 */
@ApiTags('vehicle-fuel-config')
@ApiBearerAuth('JWT-auth')
@Controller('vehicles/:vehicleId/fuel-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CHOFER, UserRole.ADMIN)
export class VehicleFuelConfigController {
  private static readonly DEFAULT_APPROVAL_THRESHOLD = 0.2;

  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(PricingParameter)
    private readonly paramRepo: Repository<PricingParameter>,
  ) {}

  @Patch()
  @ApiOperation({
    summary: 'Actualizar consumo y tipo de combustible del vehículo',
  })
  async update(
    @CurrentUser('id') userId: string,
    @CurrentUser('rol') role: UserRole,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: UpdateVehicleFuelConfigDto,
  ) {
    const vehicle = await this.vehicleRepo.findOne({
      where: { id: vehicleId },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    if (role !== UserRole.ADMIN && vehicle.userId !== userId) {
      throw new ForbiddenException('Not the owner of this vehicle');
    }

    if (dto.fuelConsumption == null && dto.fuelType == null) {
      throw new BadRequestException('Nothing to update');
    }

    let approvalRequired = false;

    if (dto.fuelConsumption != null) {
      const prior = vehicle.fuelConsumption != null ? Number(vehicle.fuelConsumption) : null;
      if (prior != null && prior > 0 && role !== UserRole.ADMIN) {
        const threshold = await this.getThreshold();
        const deltaPct = Math.abs(dto.fuelConsumption - prior) / prior;
        if (deltaPct > threshold) {
          approvalRequired = true;
        }
      }
      vehicle.fuelConsumption = dto.fuelConsumption.toFixed(2);
    }

    if (dto.fuelType != null) {
      vehicle.fuelType = dto.fuelType;
    }

    if (approvalRequired) {
      vehicle.approvalStatus = VehicleStatus.PENDING_REVIEW;
      vehicle.rejectionReason = null;
    }

    await this.vehicleRepo.save(vehicle);

    return {
      id: vehicle.id,
      fuelConsumption:
        vehicle.fuelConsumption != null ? Number(vehicle.fuelConsumption) : null,
      fuelType: vehicle.fuelType,
      approvalStatus: vehicle.approvalStatus,
      approvalRequired,
    };
  }

  private async getThreshold(): Promise<number> {
    const row = await this.paramRepo.findOne({
      where: { key: 'vehicle_fuel_change_approval_pct' },
    });
    if (!row) return VehicleFuelConfigController.DEFAULT_APPROVAL_THRESHOLD;
    const n = Number(row.value);
    return Number.isFinite(n) ? n : VehicleFuelConfigController.DEFAULT_APPROVAL_THRESHOLD;
  }
}
