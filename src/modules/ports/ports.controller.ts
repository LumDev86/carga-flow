import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PortsService } from './ports.service';
import { CreatePortDto } from './dto/create-port.dto';
import { UpdatePortDto } from './dto/update-port.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../shared/enums/user-role.enum';

@ApiTags('ports')
@Controller('ports')
export class PortsController {
  constructor(private readonly portsService: PortsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener puertos activos (para la app)' })
  getActivePorts() {
    return this.portsService.getActivePorts();
  }

  @Get('all')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener todos los puertos incluyendo inactivos (admin)' })
  getAllPorts() {
    return this.portsService.getAllPorts();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un puerto por ID' })
  getPortById(@Param('id') id: string) {
    return this.portsService.getPortById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear un nuevo puerto (admin)' })
  createPort(@Body() dto: CreatePortDto) {
    return this.portsService.createPort(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar un puerto (admin)' })
  updatePort(@Param('id') id: string, @Body() dto: UpdatePortDto) {
    return this.portsService.updatePort(id, dto);
  }

  @Patch(':id/toggle')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activar/desactivar un puerto (admin)' })
  toggleActive(@Param('id') id: string) {
    return this.portsService.toggleActive(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar un puerto (admin)' })
  deletePort(@Param('id') id: string) {
    return this.portsService.deletePort(id);
  }
}
