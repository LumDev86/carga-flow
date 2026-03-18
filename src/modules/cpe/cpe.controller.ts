import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CpeService } from './services/cpe.service';
import { AfipDelegationService } from './services/afip-delegation.service';
import { AfipService } from './services/afip.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../shared/enums/user-role.enum';
import { AuthorizeCpeDto } from './dto/authorize-cpe.dto';
import { VoidCpeDto } from './dto/void-cpe.dto';
import { VerifyDelegationDto } from './dto/verify-delegation.dto';

@ApiTags('cpe')
@Controller('cpe')
@ApiBearerAuth()
export class CpeController {
  constructor(
    private readonly cpeService: CpeService,
    private readonly delegationService: AfipDelegationService,
    private readonly afipService: AfipService,
  ) {}

  // --- Delegation (rutas fijas primero para evitar colisión con :id) ---

  @Post('delegation/verify')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SOLICITANTE, UserRole.PRODUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Verificar delegación AFIP' })
  verifyDelegation(
    @Body() dto: VerifyDelegationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.delegationService.verifyAndRegister(userId, dto.cuit);
  }

  @Get('delegation/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SOLICITANTE, UserRole.PRODUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Estado de delegación del usuario' })
  getDelegationStatus(@CurrentUser('id') userId: string) {
    return this.delegationService.getDelegationForUser(userId);
  }

  // --- Health check ---

  @Get('health')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Health check del servicio AFIP/WSAA' })
  healthCheck() {
    return this.afipService.healthCheck();
  }

  // --- Trip CPE ---

  @Post('trips/:tripId/authorize')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SOLICITANTE, UserRole.PRODUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Emitir CPE para un viaje' })
  authorizeCpe(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: AuthorizeCpeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cpeService.createAndAuthorizeCpe(tripId, userId, dto);
  }

  @Get('trips/:tripId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SOLICITANTE, UserRole.PRODUCTOR, UserRole.CHOFER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtener CPE de un viaje' })
  getCpeForTrip(@Param('tripId', ParseUUIDPipe) tripId: string) {
    return this.cpeService.getCpeByTrip(tripId);
  }

  // --- CPE por ID (rutas con :id al final para evitar colisión) ---

  @Post(':id/void')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SOLICITANTE, UserRole.PRODUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Anular CPE' })
  voidCpe(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidCpeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cpeService.voidCpe(id, userId, dto.reason);
  }

  @Get(':id/history')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SOLICITANTE, UserRole.PRODUCTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Historial de auditoría de CPE' })
  getCpeHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.cpeService.getCpeHistory(id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'URL del PDF de la CPE' })
  async getCpePdf(@Param('id', ParseUUIDPipe) id: string) {
    const cpe = await this.cpeService.queryCpe(id);
    return { pdfUrl: cpe.pdfUrl };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener CPE por ID' })
  getCpe(@Param('id', ParseUUIDPipe) id: string) {
    return this.cpeService.queryCpe(id);
  }
}
