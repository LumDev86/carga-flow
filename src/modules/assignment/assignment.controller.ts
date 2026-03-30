import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AssignmentService } from './assignment.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../shared/enums/user-role.enum';

@ApiTags('assignment')
@ApiBearerAuth()
@Controller('assignment')
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  // ==========================================
  // RANKING Y ASIGNACIÓN
  // ==========================================

  @Get('ranking/:tripId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ver ranking de drivers para un trip - Admin' })
  async getRanking(@Param('tripId') tripId: string) {
    return this.assignmentService.calculateRanking(tripId);
  }

  // ==========================================
  // REPUTACIÓN / SCORES
  // ==========================================

  @Get('driver/:driverId/score')
  @ApiOperation({ summary: 'Ver score de un driver' })
  async getDriverScore(@Param('driverId') driverId: string) {
    return this.assignmentService.getDriverScore(driverId);
  }

  @Get('drivers/ranking')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ranking general de drivers por score - Admin' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getDriverRanking(@Query('limit') limit?: string) {
    return this.assignmentService.getDriverRanking(limit ? parseInt(limit) : 50);
  }

  @Post('driver/:driverId/recalculate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Forzar recálculo de score de un driver - Admin' })
  async recalculateDriverScore(@Param('driverId') driverId: string) {
    return this.assignmentService.recalculateScore(driverId);
  }

  @Post('drivers/recalculate-all')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Recalcular scores de todos los drivers - Admin' })
  async recalculateAll() {
    return this.assignmentService.recalculateAll();
  }
}
