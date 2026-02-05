import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
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

@ApiTags('Trips')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo viaje' })
  create(@Req() req, @Body() dto: CreateTripDto) {
    return this.tripsService.createTrip(req.user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar mis viajes' })
  findAll(@Req() req, @Query() filters: TripFiltersDto) {
    return this.tripsService.getMyTrips(req.user.sub, filters);
  }

  @Get('available')
  @ApiOperation({ summary: 'Viajes disponibles para choferes (BROADCAST)' })
  findAvailable() {
    return this.tripsService.getAvailableTrips();
  }

  @Get('my-assigned')
  @ApiOperation({ summary: 'Viajes asignados directamente a mí' })
  findMyAssigned(@Req() req) {
    return this.tripsService.getMyAssignedTrips(req.user.sub);
  }

  @Get('active')
  @ApiOperation({ summary: 'Viajes activos (ACCEPTED + IN_TRANSIT)' })
  findActive(@Req() req) {
    return this.tripsService.getActiveTrips(req.user.sub);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estadísticas de viajes' })
  getStats(@Req() req) {
    return this.tripsService.getTripStats(req.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un viaje' })
  findOne(@Req() req, @Param('id') id: string) {
    return this.tripsService.getTripById(id, req.user.sub);
  }

  @Patch(':id/accept')
  @ApiOperation({ summary: 'Aceptar viaje (chofer)' })
  accept(@Req() req, @Param('id') id: string) {
    return this.tripsService.acceptTrip(id, req.user.sub);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Rechazar asignación directa -> broadcast' })
  reject(@Req() req, @Param('id') id: string) {
    return this.tripsService.rejectTrip(id, req.user.sub);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Iniciar tránsito (ACCEPTED -> IN_TRANSIT)' })
  start(@Req() req, @Param('id') id: string) {
    return this.tripsService.startTrip(id, req.user.sub);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Completar viaje con evidencia' })
  complete(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: CompleteTripDto,
  ) {
    return this.tripsService.completeTrip(id, req.user.sub, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar viaje (solicitante)' })
  cancel(@Req() req, @Param('id') id: string) {
    return this.tripsService.cancelTrip(id, req.user.sub);
  }

  @Patch(':id/rate')
  @ApiOperation({ summary: 'Calificar viaje completado' })
  rate(@Req() req, @Param('id') id: string, @Body() dto: RateTripDto) {
    return this.tripsService.rateTrip(id, req.user.sub, dto);
  }

  @Post(':id/evidence')
  @ApiOperation({ summary: 'Subir fotos de evidencia' })
  @UseInterceptors(FileInterceptor('file'))
  uploadEvidence(
    @Req() req,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // For now, return the file info. Supabase storage integration can be added later.
    return {
      tripId: id,
      filename: file?.originalname,
      size: file?.size,
      mimetype: file?.mimetype,
      message: 'Evidencia recibida',
    };
  }

  @Patch(':id/location')
  @ApiOperation({ summary: 'Actualizar ubicación del conductor en tiempo real' })
  updateLocation(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.tripsService.updateDriverLocation(id, req.user.sub, dto);
  }
}
