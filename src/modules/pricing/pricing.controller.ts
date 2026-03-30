import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../shared/enums/user-role.enum';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdatePricingParameterDto, CreatePricingParameterDto } from './dto/update-pricing-parameter.dto';
import { ImportCatacDto } from './dto/import-catac.dto';
import { PricingCategory } from './entities/pricing-parameter.entity';

@ApiTags('pricing')
@ApiBearerAuth()
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  // ==========================================
  // COTIZACIONES
  // ==========================================

  @Post('quote')
  @ApiOperation({ summary: 'Calcular cotización de viaje (motor CATAC)' })
  async calculateQuote(@Body() dto: CreateQuoteDto, @Req() req: any) {
    return this.pricingService.calculateQuote(dto, req.user?.id);
  }

  @Get('quotes/:id')
  @ApiOperation({ summary: 'Obtener cotización por ID' })
  async getQuote(@Param('id') id: string) {
    return this.pricingService.getQuoteById(id);
  }

  // ==========================================
  // TABLA CATAC
  // ==========================================

  @Get('catac')
  @ApiOperation({ summary: 'Ver tabla CATAC vigente' })
  async getCatacTariffs() {
    return this.pricingService.getCatacTariffs();
  }

  @Get('catac/count')
  @ApiOperation({ summary: 'Cantidad de entradas en tabla CATAC' })
  async getCatacCount() {
    return { count: await this.pricingService.getCatacTariffCount() };
  }

  @Get('catac/lookup')
  @ApiOperation({ summary: 'Lookup tarifa CATAC para una distancia' })
  @ApiQuery({ name: 'km', type: Number })
  async lookupCatac(@Query('km') km: string) {
    const distanceKm = parseFloat(km);
    if (isNaN(distanceKm) || distanceKm <= 0) {
      throw new BadRequestException('km debe ser un número positivo');
    }
    const tariffTotal = await this.pricingService.lookupCatacBase(distanceKm);
    if (tariffTotal === null) {
      throw new NotFoundException('No hay tabla CATAC cargada');
    }
    return {
      km: distanceKm,
      tariffTotal: Math.round(tariffTotal),
      avgPerKm: Math.round((tariffTotal / distanceKm) * 100) / 100,
    };
  }

  @Post('catac/import')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Importar tabla CATAC completa (reemplaza existente) - Admin' })
  async importCatac(@Body() dto: ImportCatacDto) {
    return this.pricingService.importCatacTariffs(
      dto.entries,
      dto.version,
      dto.validFrom,
    );
  }

  @Post('catac/upsert')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Agregar/actualizar tarifas CATAC parcialmente - Admin' })
  async upsertCatac(@Body() dto: ImportCatacDto) {
    return this.pricingService.upsertCatacTariffs(
      dto.entries,
      dto.version,
      dto.validFrom,
    );
  }

  // ==========================================
  // PARÁMETROS DINÁMICOS
  // ==========================================

  @Get('parameters')
  @ApiOperation({ summary: 'Listar todos los parámetros de pricing' })
  @ApiQuery({ name: 'category', required: false, enum: PricingCategory })
  async getParameters(@Query('category') category?: PricingCategory) {
    if (category) {
      return this.pricingService.getParametersByCategory(category);
    }
    return this.pricingService.getAllParameters();
  }

  @Get('parameters/:key')
  @ApiOperation({ summary: 'Obtener valor de un parámetro' })
  async getParameter(@Param('key') key: string) {
    const value = await this.pricingService.getParameterValue(key);
    return { key, value };
  }

  @Post('parameters')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear un parámetro nuevo - Admin' })
  async createParameter(@Body() dto: CreatePricingParameterDto, @Req() req: any) {
    return this.pricingService.createParameter({
      key: dto.key,
      value: dto.value,
      description: dto.description,
      category: dto.category,
      validFrom: dto.validFrom,
    });
  }

  @Patch('parameters/:key')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar valor de un parámetro - Admin' })
  async updateParameter(
    @Param('key') key: string,
    @Body() dto: UpdatePricingParameterDto,
    @Req() req: any,
  ) {
    return this.pricingService.updateParameter(
      key,
      dto.value,
      req.user?.id,
      dto.description,
      dto.validFrom,
    );
  }

  // ==========================================
  // SEED / ADMIN
  // ==========================================

  @Post('seed')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear parámetros iniciales si no existen - Admin' })
  async seedParameters() {
    return this.pricingService.seedDefaultParameters();
  }
}
