import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
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
import { ConfirmFleteReceivedDto } from '../trips/dto/confirm-flete.dto';
import { ProcessWithdrawalDto, RejectWithdrawalDto } from '../wallet/dto/process-withdrawal.dto';

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

  // ---- Flete / Payment ----

  @Get('trips-pending-flete')
  @ApiOperation({ summary: 'Viajes entregados pendientes de cobro del puerto' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Viajes pendientes de flete' })
  async getTripsPendingFlete(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.getTripsPendingFlete({ page, limit });
  }

  @Patch('trips/:id/confirm-flete')
  @ApiOperation({ summary: 'Confirmar que el puerto pagó el flete — acredita wallet del conductor' })
  @ApiResponse({ status: 200, description: 'Flete confirmado, conductor acreditado' })
  @ApiResponse({ status: 404, description: 'Viaje no encontrado' })
  async confirmFleteReceived(
    @Param('id') id: string,
    @Body() dto: ConfirmFleteReceivedDto,
  ) {
    return this.adminService.confirmFleteReceived(id, dto);
  }

  // ---- Vehicles ----

  @Get('vehicles')
  @ApiOperation({ summary: 'Listar vehículos con paginación y filtros' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'approvalStatus', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista paginada de vehículos' })
  async findAllVehicles(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('approvalStatus') approvalStatus?: string,
  ) {
    return this.adminService.findAllVehicles({ page, limit, type, search, approvalStatus });
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

  @Patch('vehicles/:id/approve')
  @ApiOperation({ summary: 'Aprobar un vehículo' })
  @ApiResponse({ status: 200, description: 'Vehículo aprobado' })
  @ApiResponse({ status: 404, description: 'Vehículo no encontrado' })
  async approveVehicle(@Param('id') id: string) {
    const vehicle = await this.adminService.approveVehicle(id);
    if (!vehicle) {
      throw new NotFoundException('Vehículo no encontrado');
    }
    return vehicle;
  }

  @Patch('vehicles/:id/reject')
  @ApiOperation({ summary: 'Rechazar un vehículo' })
  @ApiResponse({ status: 200, description: 'Vehículo rechazado' })
  @ApiResponse({ status: 404, description: 'Vehículo no encontrado' })
  async rejectVehicle(
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const vehicle = await this.adminService.rejectVehicle(id, body.reason);
    if (!vehicle) {
      throw new NotFoundException('Vehículo no encontrado');
    }
    return vehicle;
  }

  // ---- Wallets ----

  @Get('wallets')
  @ApiOperation({ summary: 'Listar conductores con saldo de wallet' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista de wallets de conductores' })
  async findDriverWallets(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.adminService.findDriverWallets({ page, limit, search });
  }

  @Get('wallets/:userId/transactions')
  @ApiOperation({ summary: 'Historial de transacciones de un conductor' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Transacciones del conductor' })
  async findWalletTransactions(
    @Param('userId') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.findWalletTransactions(userId, { page, limit });
  }

  // ---- Withdrawals ----

  @Get('withdrawals')
  @ApiOperation({ summary: 'Listar solicitudes de retiro' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Lista de solicitudes de retiro' })
  async findAllWithdrawals(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.adminService.findAllWithdrawals({ page, limit, status });
  }

  @Patch('withdrawals/:id/process')
  @ApiOperation({ summary: 'Procesar (aprobar) un retiro — marcar como transferido' })
  @ApiResponse({ status: 200, description: 'Retiro procesado' })
  async processWithdrawal(
    @Param('id') id: string,
    @Body() dto: ProcessWithdrawalDto,
  ) {
    return this.adminService.processWithdrawal(id, dto);
  }

  @Patch('withdrawals/:id/reject')
  @ApiOperation({ summary: 'Rechazar un retiro — devuelve fondos al wallet' })
  @ApiResponse({ status: 200, description: 'Retiro rechazado, fondos devueltos' })
  async rejectWithdrawal(
    @Param('id') id: string,
    @Body() dto: RejectWithdrawalDto,
  ) {
    return this.adminService.rejectWithdrawal(id, dto);
  }
}
