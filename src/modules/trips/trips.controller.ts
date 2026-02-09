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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { CompleteTripDto } from './dto/complete-trip.dto';
import { RateTripDto } from './dto/rate-trip.dto';
import { TripFiltersDto } from './dto/trip-filters.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Trips')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
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
  @ApiOperation({ summary: 'Viajes disponibles para choferes (BROADCAST)' })
  findAvailable() {
    return this.tripsService.getAvailableTrips();
  }

  @Get('my-assigned')
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

  @Post('test/seed-drivers')
  @ApiOperation({ summary: '[TEST] Crear/resetear conductores de prueba' })
  seedDrivers() {
    return this.tripsService.seedTestDrivers();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un viaje' })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.tripsService.getTripById(id, userId);
  }

  @Patch(':id/accept')
  @ApiOperation({ summary: 'Aceptar viaje (chofer)' })
  accept(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.tripsService.acceptTrip(id, userId);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Rechazar asignación directa -> broadcast' })
  reject(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.tripsService.rejectTrip(id, userId);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Iniciar tránsito (ACCEPTED -> IN_TRANSIT)' })
  start(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.tripsService.startTrip(id, userId);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Completar viaje con evidencia' })
  complete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CompleteTripDto,
  ) {
    return this.tripsService.completeTrip(id, userId, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar viaje (solicitante o chofer)' })
  cancel(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.tripsService.cancelTrip(id, userId);
  }

  @Patch(':id/rate')
  @ApiOperation({ summary: 'Calificar viaje completado' })
  rate(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: RateTripDto) {
    return this.tripsService.rateTrip(id, userId, dto);
  }

  @Post(':id/evidence')
  @ApiOperation({ summary: 'Subir fotos de evidencia' })
  @UseInterceptors(FileInterceptor('file'))
  uploadEvidence(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // For now, return the file info. Supabase storage integration can be added later.
    return {
      tripId: id,
      userId,
      filename: file?.originalname,
      size: file?.size,
      mimetype: file?.mimetype,
      message: 'Evidencia recibida',
    };
  }

  @Patch(':id/location')
  @ApiOperation({ summary: 'Actualizar ubicación del conductor en tiempo real' })
  updateLocation(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.tripsService.updateDriverLocation(id, userId, dto);
  }
}
