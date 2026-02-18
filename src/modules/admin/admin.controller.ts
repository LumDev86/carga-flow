import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../shared/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('admin')
@Controller('admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ---- Dashboard ----

  @Get('dashboard/kpis')
  @ApiOperation({ summary: 'Obtener KPIs del dashboard' })
  @ApiResponse({ status: 200, description: 'KPIs del dashboard' })
  async getDashboardKpis() {
    return this.adminService.getDashboardKpis();
  }

  @Get('dashboard/trips-by-month')
  @ApiOperation({ summary: 'Viajes por mes (últimos 12 meses)' })
  @ApiResponse({ status: 200, description: 'Datos de viajes por mes' })
  async getTripsByMonth() {
    return this.adminService.getTripsByMonth();
  }

  @Get('dashboard/revenue-trend')
  @ApiOperation({ summary: 'Tendencia de ingresos por mes' })
  @ApiResponse({ status: 200, description: 'Datos de ingresos y comisiones' })
  async getRevenueTrend() {
    return this.adminService.getRevenueTrend();
  }

  @Get('dashboard/trips-by-status')
  @ApiOperation({ summary: 'Viajes agrupados por estado' })
  @ApiResponse({ status: 200, description: 'Conteo de viajes por estado' })
  async getTripsByStatus() {
    return this.adminService.getTripsByStatus();
  }

  // ---- Trips ----

  @Get('trips')
  @ApiOperation({ summary: 'Listar viajes con paginación y filtros' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiQuery({ name: 'transportType', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista paginada de viajes' })
  async findAllTrips(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('transportType') transportType?: string,
  ) {
    return this.adminService.findAllTrips({
      page,
      limit,
      status,
      search,
      dateFrom,
      dateTo,
      transportType,
    });
  }

  @Get('trips/:id')
  @ApiOperation({ summary: 'Obtener detalle de viaje por ID' })
  @ApiResponse({ status: 200, description: 'Detalle del viaje' })
  @ApiResponse({ status: 404, description: 'Viaje no encontrado' })
  async findTripById(@Param('id') id: string) {
    const trip = await this.adminService.findTripById(id);
    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }
    return trip;
  }

  // ---- Vehicles ----

  @Get('vehicles')
  @ApiOperation({ summary: 'Listar vehículos con paginación y filtros' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista paginada de vehículos' })
  async findAllVehicles(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.findAllVehicles({ page, limit, type, search });
  }

  @Get('vehicles/:id')
  @ApiOperation({ summary: 'Obtener detalle de vehículo por ID' })
  @ApiResponse({ status: 200, description: 'Detalle del vehículo' })
  @ApiResponse({ status: 404, description: 'Vehículo no encontrado' })
  async findVehicleById(@Param('id') id: string) {
    const vehicle = await this.adminService.findVehicleById(id);
    if (!vehicle) {
      throw new NotFoundException('Vehículo no encontrado');
    }
    return vehicle;
  }
}
