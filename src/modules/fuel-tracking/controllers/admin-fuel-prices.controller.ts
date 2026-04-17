import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseEnumPipe,
  ParseFloatPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UserRole } from '../../../shared/enums/user-role.enum';
import { FuelType } from '../../../shared/enums/fuel-type.enum';
import { FuelSource } from '../../../shared/enums/fuel-source.enum';
import { RegisterFuelPriceDto } from '../dto/register-fuel-price.dto';
import { FuelPriceCommandService } from '../services/fuel-price-command.service';
import { FuelPriceQueryService } from '../services/fuel-price-query.service';
import { FuelAdjustmentQueryService } from '../services/fuel-adjustment-query.service';
import { FeatureFlagService } from '../services/feature-flag.service';
import { FuelTrackingMetricsService } from '../services/fuel-tracking-metrics.service';
import { AdjustmentStatus } from '../../../shared/enums/adjustment-status.enum';
import { AdjustmentPolicy } from '../../../shared/enums/adjustment-policy.enum';

@ApiTags('admin-fuel-prices')
@ApiBearerAuth('JWT-auth')
@Controller('admin/fuel-prices')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminFuelPricesController {
  constructor(
    private readonly cmd: FuelPriceCommandService,
    private readonly query: FuelPriceQueryService,
    private readonly adjustmentQuery: FuelAdjustmentQueryService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Registrar cambio de precio del gasoil (idempotente)',
  })
  async registerPrice(
    @CurrentUser('id') adminId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: RegisterFuelPriceDto,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (!/^[0-9a-fA-F-]{36}$/.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must be a UUID v4');
    }
    const { record, wasIdempotentHit } = await this.cmd.registerPriceChange(
      adminId,
      dto,
      idempotencyKey,
    );
    return {
      id: record.id,
      fuelType: record.fuelType,
      pricePerLiter: Number(record.pricePerLiter),
      effectiveFrom: record.effectiveFrom,
      source: record.source,
      sourceRef: record.sourceRef,
      notes: record.notes,
      createdAt: record.createdAt,
      wasIdempotentHit,
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Listado paginado del histórico de precios' })
  @ApiQuery({ name: 'fuelType', required: false, enum: FuelType })
  @ApiQuery({ name: 'source', required: false, enum: FuelSource })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listHistory(
    @Query('fuelType') fuelType?: FuelType,
    @Query('source') source?: FuelSource,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.query.listHistory({
      fuelType,
      source,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get('impact')
  @ApiOperation({
    summary: 'Simular impacto de un cambio de precio (no persiste)',
  })
  async simulateImpact(
    @Query('fuelType', new ParseEnumPipe(FuelType)) fuelType: FuelType,
    @Query('newPrice', ParseFloatPipe) newPrice: number,
  ) {
    return this.query.simulateImpact(fuelType, newPrice);
  }

  @Get('current')
  @ApiOperation({ summary: 'Precio actual vigente' })
  async getCurrent(
    @Query('fuelType', new ParseEnumPipe(FuelType)) fuelType: FuelType,
  ) {
    return this.query.getCurrent(fuelType);
  }
}

@ApiTags('admin-fuel-adjustments')
@ApiBearerAuth('JWT-auth')
@Controller('admin/fuel-adjustments')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminFuelAdjustmentsController {
  constructor(private readonly adjustmentQuery: FuelAdjustmentQueryService) {}

  @Get()
  @ApiOperation({ summary: 'Listar ajustes con filtros' })
  @ApiQuery({ name: 'status', required: false, enum: AdjustmentStatus })
  @ApiQuery({ name: 'policy', required: false, enum: AdjustmentPolicy })
  @ApiQuery({ name: 'tripId', required: false, type: String })
  @ApiQuery({ name: 'triggeringPriceId', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(
    @Query('status') status?: AdjustmentStatus,
    @Query('policy') policy?: AdjustmentPolicy,
    @Query('tripId') tripId?: string,
    @Query('triggeringPriceId') triggeringPriceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adjustmentQuery.listAdjustments({
      status,
      policy,
      tripId,
      triggeringPriceId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un ajuste' })
  async getById(@Param('id') id: string) {
    return this.adjustmentQuery.findAdjustmentById(id);
  }
}

@ApiTags('admin-feature-flags')
@ApiBearerAuth('JWT-auth')
@Controller('admin/feature-flags')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminFeatureFlagsController {
  constructor(private readonly featureFlags: FeatureFlagService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los feature flags' })
  async list() {
    return this.featureFlags.listAll();
  }

  @Patch(':key')
  @ApiOperation({ summary: 'Actualizar un feature flag' })
  async update(
    @CurrentUser('id') adminId: string,
    @Param('key') key: string,
    @Body('value') value: unknown,
  ) {
    return this.featureFlags.set(key, value, adminId);
  }
}

@ApiTags('admin-fuel-tracking-metrics')
@ApiBearerAuth('JWT-auth')
@Controller('admin/fuel-tracking/metrics')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminFuelTrackingMetricsController {
  constructor(private readonly metrics: FuelTrackingMetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Métricas del módulo fuel-tracking' })
  async get() {
    return this.metrics.snapshot();
  }
}
