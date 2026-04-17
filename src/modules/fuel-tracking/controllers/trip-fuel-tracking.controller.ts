import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UserRole } from '../../../shared/enums/user-role.enum';
import { Trip } from '../../trips/entities/trip.entity';
import { FuelAdjustmentService } from '../services/fuel-adjustment.service';
import { FuelAdjustmentQueryService } from '../services/fuel-adjustment-query.service';
import {
  AcceptAdjustmentDto,
  RejectAdjustmentDto,
} from '../dto/respond-adjustment.dto';
import { UploadLocationBatchDto } from '../dto/upload-location-batch.dto';
import { TripLocationHistory } from '../entities/trip-location-history.entity';

@ApiTags('trip-fuel-tracking')
@ApiBearerAuth('JWT-auth')
@Controller('trips/:tripId/fuel-tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SOLICITANTE, UserRole.PRODUCTOR, UserRole.CHOFER, UserRole.ADMIN)
export class TripFuelTrackingController {
  constructor(
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
    private readonly adjustmentQuery: FuelAdjustmentQueryService,
    private readonly adjustmentCmd: FuelAdjustmentService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Ver snapshot + ajustes del viaje (dador/chofer/admin)',
  })
  async getTracking(
    @CurrentUser('id') userId: string,
    @CurrentUser('rol') role: UserRole,
    @Param('tripId', ParseUUIDPipe) tripId: string,
  ) {
    await this.assertAccess(tripId, userId, role);
    const view = await this.adjustmentQuery.getTrackingView(tripId);
    if (!view) throw new NotFoundException('Trip not found');
    return view;
  }

  @Post('adjustments/:adjId/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Dador acepta un ajuste PROPOSED' })
  @Roles(UserRole.SOLICITANTE, UserRole.PRODUCTOR)
  async accept(
    @CurrentUser('id') userId: string,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('adjId', ParseUUIDPipe) adjId: string,
    @Body() _dto: AcceptAdjustmentDto,
  ) {
    await this.assertIsDador(tripId, userId);
    return this.adjustmentCmd.acceptAdjustment(adjId, userId);
  }

  @Post('adjustments/:adjId/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Dador rechaza un ajuste' })
  @Roles(UserRole.SOLICITANTE, UserRole.PRODUCTOR)
  async reject(
    @CurrentUser('id') userId: string,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('adjId', ParseUUIDPipe) adjId: string,
    @Body() dto: RejectAdjustmentDto,
  ) {
    await this.assertIsDador(tripId, userId);
    return this.adjustmentCmd.rejectAdjustment(adjId, userId, dto.reason);
  }

  private async assertAccess(
    tripId: string,
    userId: string,
    role: UserRole,
  ): Promise<Trip> {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (role === UserRole.ADMIN) return trip;
    if (trip.requesterId === userId) return trip;
    if (trip.driverId === userId) return trip;
    throw new ForbiddenException('Not allowed to view this trip');
  }

  private async assertIsDador(tripId: string, userId: string): Promise<Trip> {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.requesterId !== userId) {
      throw new ForbiddenException(
        'Only the trip requester can respond to adjustments',
      );
    }
    return trip;
  }
}

@ApiTags('trip-location')
@ApiBearerAuth('JWT-auth')
@Controller('trips/:tripId/location')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CHOFER)
export class TripLocationController {
  constructor(
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
    @InjectRepository(TripLocationHistory)
    private readonly locationRepo: Repository<TripLocationHistory>,
  ) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Upload batch de puntos GPS del chofer (máx 50 por request)',
  })
  async uploadBatch(
    @CurrentUser('id') driverId: string,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: UploadLocationBatchDto,
  ) {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.driverId !== driverId) {
      throw new ForbiddenException('Not the driver of this trip');
    }

    const rows = dto.points.map((p) =>
      this.locationRepo.create({
        tripId,
        latitude: p.latitude.toFixed(7),
        longitude: p.longitude.toFixed(7),
        speedKmh: p.speedKmh != null ? p.speedKmh.toFixed(2) : null,
        accuracyM: p.accuracyM != null ? p.accuracyM.toFixed(2) : null,
        recordedAt: new Date(p.recordedAt),
      }),
    );
    await this.locationRepo.save(rows);
    return { accepted: rows.length };
  }
}
