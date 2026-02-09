import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Vehicles')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar un vehículo' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(userId, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Mis vehículos' })
  findMy(@CurrentUser('id') userId: string) {
    return this.vehiclesService.findMyVehicles(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un vehículo' })
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vehiclesService.findOne(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar vehículo' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar vehículo' })
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vehiclesService.remove(id, userId);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Establecer como vehículo activo' })
  setActive(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.vehiclesService.setActive(id, userId);
  }

  @Post(':id/insurance')
  @ApiOperation({ summary: 'Subir foto de póliza de seguro' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadInsurance(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.vehiclesService.uploadDocument(id, userId, 'insurancePhotoUrl', file);
  }

  @Post(':id/license-front')
  @ApiOperation({ summary: 'Subir foto frente de licencia de conducir' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadLicenseFront(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.vehiclesService.uploadDocument(id, userId, 'licenseFrontUrl', file);
  }

  @Post(':id/license-back')
  @ApiOperation({ summary: 'Subir foto dorso de licencia de conducir' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadLicenseBack(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.vehiclesService.uploadDocument(id, userId, 'licenseBackUrl', file);
  }
}
