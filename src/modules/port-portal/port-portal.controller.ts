import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PortPortalService } from './port-portal.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../shared/enums/user-role.enum';
import { PortTripFiltersDto } from './dto/port-trip-filters.dto';
import { UpdateArrivalStatusDto } from './dto/update-arrival-status.dto';
import { StorageService } from '../../common/storage/storage.service';
import { TripsService } from '../trips/trips.service';

@ApiTags('port-portal')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
@Roles(UserRole.PUERTO)
@Controller('port-portal')
export class PortPortalController {
  constructor(
    private readonly portPortalService: PortPortalService,
    private readonly storageService: StorageService,
    private readonly tripsService: TripsService,
  ) {}

  // --- Perfil del Puerto ---

  @Get('me')
  @ApiOperation({ summary: 'Mi puerto (datos del puerto del usuario autenticado)' })
  getMyPort(@CurrentUser('portId') portId: string) {
    return this.portPortalService.getMyPort(portId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Actualizar notas/info del puerto' })
  updateMyPort(
    @CurrentUser('portId') portId: string,
    @Body() body: { notes?: string },
  ) {
    return this.portPortalService.updateMyPort(portId, body);
  }

  // --- Dashboard ---

  @Get('dashboard')
  @ApiOperation({ summary: 'KPIs del puerto' })
  getDashboard(@CurrentUser('portId') portId: string) {
    return this.portPortalService.getDashboard(portId);
  }

  // --- Gestión de Viajes ---

  @Get('trips')
  @ApiOperation({ summary: 'Lista paginada de viajes del puerto' })
  getTrips(@CurrentUser('portId') portId: string, @Query() filters: PortTripFiltersDto) {
    return this.portPortalService.getPortTrips(portId, filters);
  }

  @Get('trips/today')
  @ApiOperation({ summary: 'Viajes de hoy: arrivals y departures' })
  getTodayTrips(@CurrentUser('portId') portId: string) {
    return this.portPortalService.getTodayTrips(portId);
  }

  @Get('trips/:id')
  @ApiOperation({ summary: 'Detalle completo del viaje' })
  getTripDetail(
    @CurrentUser('portId') portId: string,
    @Param('id', ParseUUIDPipe) tripId: string,
  ) {
    return this.portPortalService.getTripDetail(portId, tripId);
  }

  @Get('trips/:id/timeline')
  @ApiOperation({ summary: 'Timeline estructurado del viaje' })
  getTripTimeline(
    @CurrentUser('portId') portId: string,
    @Param('id', ParseUUIDPipe) tripId: string,
  ) {
    return this.portPortalService.getTripTimeline(portId, tripId);
  }

  @Patch('trips/:id/confirm-unload')
  @ApiOperation({ summary: 'Confirmar descarga (solo puerto destino)' })
  confirmUnload(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) tripId: string,
  ) {
    return this.portPortalService.confirmUnload(user.portId, user.id, tripId);
  }

  @Patch('trips/:id/arrival-status')
  @ApiOperation({ summary: 'Actualizar estado de arribo (solo puerto destino)' })
  updateArrivalStatus(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) tripId: string,
    @Body() dto: UpdateArrivalStatusDto,
  ) {
    return this.portPortalService.updateArrivalStatus(user.portId, user.id, tripId, dto);
  }

  // --- Documentos ---

  @Get('trips/:id/documents')
  @ApiOperation({ summary: 'Listar documentos del viaje' })
  getTripDocuments(
    @CurrentUser('portId') portId: string,
    @Param('id', ParseUUIDPipe) tripId: string,
  ) {
    return this.portPortalService.getTripDocuments(portId, tripId);
  }

  @Post('trips/:id/documents')
  @ApiOperation({ summary: 'Subir documento al viaje' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @CurrentUser('portId') portId: string,
    @Param('id', ParseUUIDPipe) tripId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
  ) {
    // Validate trip belongs to port
    await this.portPortalService.getTripDetail(portId, tripId);
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }
    const publicUrl = await this.storageService.uploadFile(file, `trips/${tripId}/documents`);
    return this.tripsService.addTripDocument(tripId, type || 'OTRO', publicUrl, file.originalname);
  }

  // --- CPE ---

  @Get('trips/:id/cpe')
  @ApiOperation({ summary: 'Ver CPE del viaje' })
  getTripCpe(
    @CurrentUser('portId') portId: string,
    @Param('id', ParseUUIDPipe) tripId: string,
  ) {
    return this.portPortalService.getTripCpe(portId, tripId);
  }

  @Get('cpe/:id/pdf')
  @ApiOperation({ summary: 'Obtener URL del PDF de CPE' })
  getCpePdf(@Param('id', ParseUUIDPipe) cpeId: string) {
    return this.portPortalService.getCpePdf(cpeId);
  }

  // --- Incidentes ---

  @Get('trips/:id/incidents')
  @ApiOperation({ summary: 'Listar incidentes del viaje' })
  getTripIncidents(
    @CurrentUser('portId') portId: string,
    @Param('id', ParseUUIDPipe) tripId: string,
  ) {
    return this.portPortalService.getTripIncidents(portId, tripId);
  }

  // --- Observaciones de Calidad ---

  @Post('trips/:id/quality')
  @ApiOperation({ summary: 'Registrar observaciones de calidad del viaje' })
  createQualityObservations(
    @CurrentUser('id') userId: string,
    @CurrentUser('portId') portId: string,
    @Param('id', ParseUUIDPipe) tripId: string,
    @Body() body: { observations: any[] },
  ) {
    return this.tripsService.createQualityObservations(tripId, userId, body.observations);
  }

  @Get('trips/:id/quality')
  @ApiOperation({ summary: 'Ver observaciones de calidad del viaje' })
  getQualityObservations(
    @CurrentUser('portId') portId: string,
    @Param('id', ParseUUIDPipe) tripId: string,
  ) {
    return this.tripsService.getQualityObservations(tripId);
  }

  // --- Flete Pendiente ---

  @Get('pending-flete')
  @ApiOperation({ summary: 'Viajes con flete pendiente de cobro' })
  getPendingFlete(@CurrentUser('portId') portId: string) {
    return this.portPortalService.getPendingFlete(portId);
  }

  // --- Estadísticas ---

  @Get('stats')
  @ApiOperation({ summary: 'Estadísticas del puerto' })
  getStats(@CurrentUser('portId') portId: string) {
    return this.portPortalService.getPortStats(portId);
  }
}
