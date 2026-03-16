import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { StorageService } from '../../common/storage/storage.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { EstimateTripDto } from './dto/estimate-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { CompleteTripDto } from './dto/complete-trip.dto';
import { RateTripDto } from './dto/rate-trip.dto';
import { DriverRateTripDto } from './dto/driver-rate-trip.dto';
import { TripFiltersDto } from './dto/trip-filters.dto';
import { UpdateDriverLocationDto } from './dto/update-location.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '../../shared/enums/user-role.enum';

@ApiTags('Trips')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly storageService: StorageService,
  ) {}

  @Post('estimate')
  @Roles(UserRole.SOLICITANTE, UserRole.PUERTO, UserRole.ADMIN, UserRole.PRODUCTOR)
  @ApiOperation({ summary: 'Estimar tarifa sin crear viaje' })
  estimate(@Body() dto: EstimateTripDto) {
    return this.tripsService.estimateTrip(dto);
  }

  @Post()
  @Roles(UserRole.SOLICITANTE, UserRole.PUERTO, UserRole.ADMIN, UserRole.PRODUCTOR)
  @ApiOperation({ summary: 'Crear un nuevo viaje' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateTripDto) {
    return this.tripsService.createTrip(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar mis viajes' })
  findAll(@CurrentUser('id') userId: string, @Query() filters: TripFiltersDto) {
    return this.tripsService.getMyTrips(userId, filters);
  }

  @Get('available')
  @Roles(UserRole.CHOFER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Viajes disponibles para choferes (BROADCAST)' })
  findAvailable() {
    return this.tripsService.getAvailableTrips();
  }

  @Get('my-assigned')
  @Roles(UserRole.CHOFER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Viajes asignados directamente a mí' })
  findMyAssigned(@CurrentUser('id') userId: string) {
    return this.tripsService.getMyAssignedTrips(userId);
  }

  @Get('active')
  @ApiOperation({ summary: 'Viajes activos (ACCEPTED + IN_TRANSIT)' })
  findActive(@CurrentUser('id') userId: string) {
    return this.tripsService.getActiveTrips(userId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estadísticas de viajes' })
  getStats(@CurrentUser('id') userId: string) {
    return this.tripsService.getTripStats(userId);
  }

  @Get('my-reviews')
  @Roles(UserRole.CHOFER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mis calificaciones como chofer' })
  getMyReviews(@CurrentUser('id') userId: string) {
    return this.tripsService.getMyReviews(userId);
  }

  @Get('my-reviews-as-requester')
  @Roles(UserRole.SOLICITANTE, UserRole.PUERTO, UserRole.PRODUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Calificaciones recibidas como dador de carga' })
  getMyReviewsAsRequester(@CurrentUser('id') userId: string) {
    return this.tripsService.getMyReviewsAsRequester(userId);
  }

  @Post('test/seed-drivers')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[TEST] Crear/resetear conductores de prueba' })
  seedDrivers() {
    return this.tripsService.seedTestDrivers();
  }

  @Post('test/cleanup-trips')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[TEST] Eliminar trips en PENDING/ASSIGNED/BROADCAST' })
  cleanupTrips() {
    return this.tripsService.cleanupTestTrips();
  }

  @Post(':id/documents')
  @Roles(UserRole.SOLICITANTE, UserRole.PUERTO, UserRole.ADMIN, UserRole.PRODUCTOR, UserRole.CHOFER)
  @ApiOperation({ summary: 'Subir documento al viaje' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }
    const publicUrl = await this.storageService.uploadFile(file, `trips/${id}/documents`);
    return this.tripsService.addTripDocument(id, type || 'OTRO', publicUrl, file.originalname);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Listar documentos del viaje' })
  getDocuments(@Param('id') id: string) {
    return this.tripsService.getTripDocuments(id);
  }

  @Patch(':id')
  @Roles(UserRole.SOLICITANTE, UserRole.PUERTO, UserRole.ADMIN, UserRole.PRODUCTOR)
  @ApiOperation({ summary: 'Editar viaje (antes de ser aceptado)' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.tripsService.updateTrip(id, userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un viaje' })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.tripsService.getTripById(id, userId);
  }

  @Patch(':id/accept')
  @Roles(UserRole.CHOFER)
  @ApiOperation({ summary: 'Aceptar viaje (chofer)' })
  accept(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.tripsService.acceptTrip(id, userId);
  }

  @Patch(':id/reject')
  @Roles(UserRole.CHOFER)
  @ApiOperation({ summary: 'Rechazar asignación directa -> broadcast' })
  reject(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.tripsService.rejectTrip(id, userId);
  }

  @Patch(':id/start')
  @Roles(UserRole.CHOFER)
  @ApiOperation({ summary: 'Iniciar tránsito (ACCEPTED -> IN_TRANSIT)' })
  start(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.tripsService.startTrip(id, userId);
  }

  @Patch(':id/complete')
  @Roles(UserRole.CHOFER)
  @ApiOperation({ summary: 'Completar viaje con evidencia' })
  complete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CompleteTripDto,
  ) {
    return this.tripsService.completeTrip(id, userId, dto);
  }

  @Patch(':id/viewing')
  @Roles(UserRole.CHOFER)
  @ApiOperation({ summary: 'Marcar que el chofer está viendo el viaje' })
  markViewing(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.tripsService.markTripAsViewing(id, userId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar viaje (solicitante o chofer)' })
  cancel(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.tripsService.cancelTrip(id, userId);
  }

  @Patch(':id/rate')
  @Roles(UserRole.SOLICITANTE, UserRole.PUERTO, UserRole.PRODUCTOR)
  @ApiOperation({ summary: 'Calificar viaje completado' })
  rate(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: RateTripDto) {
    return this.tripsService.rateTrip(id, userId, dto);
  }

  @Patch(':id/driver-rate')
  @Roles(UserRole.CHOFER)
  @ApiOperation({ summary: 'Calificar al dador de carga (chofer)' })
  driverRate(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: DriverRateTripDto) {
    return this.tripsService.driverRateTrip(id, userId, dto);
  }

  @Patch(':id/confirm-unload')
  @Roles(UserRole.SOLICITANTE, UserRole.PUERTO, UserRole.PRODUCTOR)
  @ApiOperation({ summary: 'Confirmar descarga del camión' })
  confirmUnload(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.tripsService.confirmUnload(id, userId);
  }

  @Post(':id/evidence')
  @Roles(UserRole.CHOFER)
  @ApiOperation({ summary: 'Subir fotos de evidencia' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadEvidence(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const publicUrl = await this.storageService.uploadFile(file, `trips/${id}/evidence`);

    return {
      tripId: id,
      url: publicUrl,
      filename: file.originalname,
      mimetype: file.mimetype,
    };
  }

  @Post(':id/carta-de-porte')
  @Roles(UserRole.SOLICITANTE, UserRole.PUERTO, UserRole.ADMIN, UserRole.PRODUCTOR)
  @ApiOperation({ summary: 'Subir carta de porte' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadCartaDePorte(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const publicUrl = await this.storageService.uploadFile(file, `trips/${id}/carta-de-porte`);

    // Save URL to trip entity
    await this.tripsService.updateCartaDePorteUrl(id, publicUrl);

    return {
      tripId: id,
      url: publicUrl,
      filename: file.originalname,
      mimetype: file.mimetype,
    };
  }

  @Patch(':id/location')
  @Roles(UserRole.CHOFER)
  @ApiOperation({ summary: 'Actualizar ubicación del conductor en tiempo real' })
  updateLocation(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDriverLocationDto,
  ) {
    return this.tripsService.updateDriverLocation(id, userId, dto);
  }
}
