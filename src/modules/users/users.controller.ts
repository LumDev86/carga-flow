import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { SignIntermediationDto } from './dto/sign-intermediation.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../shared/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@Controller('users')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar usuarios con paginación y filtros (solo ADMIN)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de usuarios' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return await this.usersService.findAllPaginated({ page, limit, role, status, search });
  }

  @Patch('push-token')
  @ApiOperation({ summary: 'Registrar o eliminar push token del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Push token actualizado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async updatePushToken(
    @CurrentUser('id') userId: string,
    @Body() body: { pushToken: string | null },
  ) {
    await this.usersService.updatePushToken(userId, body.pushToken);
    return { message: 'Push token actualizado' };
  }

  @Patch('location')
  @ApiOperation({ summary: 'Actualizar ubicación del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Ubicación actualizada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos de ubicación inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async updateLocation(
    @CurrentUser('id') userId: string,
    @Body() updateLocationDto: UpdateLocationDto,
  ) {
    return await this.usersService.updateLocation(userId, updateLocationDto);
  }

  @Post('intermediation-auth')
  @ApiOperation({ summary: 'Firmar autorización de intermediación de flete' })
  @ApiResponse({ status: 200, description: 'Autorización firmada exitosamente' })
  @ApiResponse({ status: 400, description: 'Ya fue firmada previamente' })
  async signIntermediationAuth(
    @CurrentUser('id') userId: string,
    @Body() dto: SignIntermediationDto,
  ) {
    return await this.usersService.signIntermediationAuth(userId, dto);
  }

  @Get('intermediation-auth/status')
  @ApiOperation({ summary: 'Consultar estado de autorización de intermediación' })
  @ApiResponse({ status: 200, description: 'Estado de autorización' })
  async getIntermediationAuthStatus(@CurrentUser('id') userId: string) {
    return await this.usersService.getIntermediationAuthStatus(userId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtener usuario por ID (solo ADMIN)' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async findOne(@Param('id') id: string) {
    return await this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar usuario (solo ADMIN)' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return await this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar usuario (solo ADMIN)' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
    return { message: 'Usuario eliminado exitosamente' };
  }
}
