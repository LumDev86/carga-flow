import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AntiBypassService } from './anti-bypass.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../shared/enums/user-role.enum';
import { BypassEventType, BypassEventStatus } from './entities/bypass-event.entity';

@ApiTags('anti-bypass')
@ApiBearerAuth()
@Controller('anti-bypass')
export class AntiBypassController {
  constructor(private readonly antiBypassService: AntiBypassService) {}

  @Post('events')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Registrar evento de bypass manualmente - Admin' })
  async registerEvent(
    @Body()
    body: {
      userId: string;
      relatedUserId?: string;
      tripId?: string;
      type: BypassEventType;
      description?: string;
      metadata?: Record<string, any>;
    },
  ) {
    return this.antiBypassService.registerEvent(body);
  }

  @Get('events')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar eventos de bypass - Admin' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'type', required: false, enum: BypassEventType })
  @ApiQuery({ name: 'status', required: false, enum: BypassEventStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getEvents(
    @Query('userId') userId?: string,
    @Query('type') type?: BypassEventType,
    @Query('status') status?: BypassEventStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.antiBypassService.getEvents({
      userId,
      type,
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Patch('events/:id/review')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Revisar evento de bypass - Admin' })
  async reviewEvent(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { status: BypassEventStatus; adminNotes?: string },
  ) {
    return this.antiBypassService.reviewEvent(id, req.user.id, body.status, body.adminNotes);
  }

  @Get('users/:userId/check')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Verificar patrones de bypass de un usuario - Admin' })
  async checkUser(@Param('userId') userId: string) {
    const [bypassCount, patterns] = await Promise.all([
      this.antiBypassService.getUserBypassCount(userId),
      this.antiBypassService.detectRepeatedDriverPattern(userId),
    ]);

    return {
      userId,
      bypassEvents: bypassCount,
      repeatedDriverPatterns: patterns,
    };
  }

  @Get('users/:userId/bypass-count')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Contar eventos de bypass de un usuario - Admin' })
  async getBypassCount(@Param('userId') userId: string) {
    return this.antiBypassService.getUserBypassCount(userId);
  }
}
