import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TariffService } from './tariffs.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../shared/enums/user-role.enum';
import { BulkGrainTariffDto } from './dto/grain-tariff.dto';

@ApiTags('tariffs')
@Controller('tariffs')
export class TariffController {
  constructor(private readonly tariffService: TariffService) {}

  // ==========================================
  // Tarifas generales por tipo de transporte
  // ==========================================

  @Get()
  @ApiOperation({ summary: 'Obtener tarifas activas por tipo de transporte' })
  getActiveTariffs() {
    return this.tariffService.getActiveTariffs();
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar tarifa de transporte (admin)' })
  updateTariff(
    @Param('id') id: string,
    @Body() body: { pricePerKm?: number; commissionRate?: number },
  ) {
    return this.tariffService.updateTariff(id, body);
  }

  // ==========================================
  // Tarifas cerealeras (Fe.Tr.A)
  // ==========================================

  @Get('grain')
  @ApiOperation({ summary: 'Obtener tabla de tarifas cerealeras ($/TN por km)' })
  getGrainTariffs() {
    return this.tariffService.getGrainTariffs();
  }

  @Get('grain/count')
  @ApiOperation({ summary: 'Cantidad de entradas en la tabla cerealera' })
  getGrainTariffCount() {
    return this.tariffService.getGrainTariffCount();
  }

  @Get('grain/price')
  @ApiOperation({ summary: 'Calcular precio para un viaje de granos' })
  async calculateGrainPrice(
    @Query('distanceKm') distanceKm: string,
    @Query('weightTon') weightTon: string,
  ) {
    const result = await this.tariffService.calculateGrainPrice(
      parseFloat(distanceKm),
      parseFloat(weightTon),
    );

    if (!result) {
      return { error: 'No hay tarifas cerealeras cargadas o los parámetros son inválidos' };
    }

    return result;
  }

  @Post('grain')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cargar/actualizar tarifas cerealeras masivamente (admin)' })
  bulkUpsertGrainTariffs(@Body() dto: BulkGrainTariffDto) {
    return this.tariffService.bulkUpsertGrainTariffs(dto.entries);
  }

  @Post('grain/replace')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reemplazar toda la tabla de tarifas cerealeras (admin)' })
  replaceAllGrainTariffs(@Body() dto: BulkGrainTariffDto) {
    return this.tariffService.replaceAllGrainTariffs(dto.entries);
  }
}
