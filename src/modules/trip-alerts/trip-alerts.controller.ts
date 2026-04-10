import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TripAlertsService } from './trip-alerts.service';
import { CreateTripAlertDto } from './dto/create-trip-alert.dto';
import { CancelTripAlertDto } from './dto/cancel-trip-alert.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../shared/enums/user-role.enum';

@ApiTags('trip-alerts')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
@Controller('trip-alerts')
export class TripAlertsController {
  constructor(private readonly tripAlertsService: TripAlertsService) {}

  @Post()
  @Roles(UserRole.PUERTO)
  @ApiOperation({
    summary: 'Enviar una alerta al dador del trip (solo operadores de puerto)',
  })
  create(
    @CurrentUser('id') userId: string,
    @CurrentUser('portId') portId: string,
    @Body() dto: CreateTripAlertDto,
  ) {
    return this.tripAlertsService.createAlert(userId, portId, dto);
  }

  @Get()
  @Roles(UserRole.PUERTO, UserRole.SOLICITANTE, UserRole.PRODUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar alertas de un trip específico' })
  @ApiQuery({ name: 'tripId', required: true })
  getByTrip(
    @CurrentUser('id') userId: string,
    @CurrentUser('rol') userRole: UserRole,
    @CurrentUser('portId') portId: string | null,
    @Query('tripId', ParseUUIDPipe) tripId: string,
  ) {
    return this.tripAlertsService.getAlertsByTrip(tripId, userId, userRole, portId);
  }

  @Get('me')
  @Roles(UserRole.SOLICITANTE, UserRole.PRODUCTOR)
  @ApiOperation({
    summary: 'Listar mis alertas recibidas (dadores) con conteo de no leídas',
  })
  getMy(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.tripAlertsService.getMyAlerts(userId, page || 1, limit || 20);
  }

  @Patch(':id/read')
  @Roles(UserRole.SOLICITANTE, UserRole.PRODUCTOR)
  @ApiOperation({ summary: 'Marcar una alerta como leída (dador)' })
  markRead(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tripAlertsService.markAsRead(id, userId);
  }

  @Patch(':id/acknowledge')
  @Roles(UserRole.SOLICITANTE, UserRole.PRODUCTOR)
  @ApiOperation({ summary: 'Confirmar recepción de una alerta (dador)' })
  acknowledge(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tripAlertsService.acknowledge(id, userId);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.PUERTO)
  @ApiOperation({
    summary: 'Cancelar una alerta no leída (solo quien la envió)',
  })
  cancel(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelTripAlertDto,
  ) {
    return this.tripAlertsService.cancel(id, userId, dto.reason);
  }
}
