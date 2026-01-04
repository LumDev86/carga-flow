import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
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
  @ApiOperation({ summary: 'Listar todos los usuarios (solo ADMIN)' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios' })
  async findAll() {
    return await this.usersService.findAll();
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
