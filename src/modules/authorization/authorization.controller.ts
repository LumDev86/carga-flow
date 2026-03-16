import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthorizationService } from './authorization.service';
import { SignAuthorizationDto } from './dto/sign-authorization.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../shared/enums/user-role.enum';

@ApiTags('Authorization')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
@Controller('authorization')
export class AuthorizationController {
  constructor(private readonly authorizationService: AuthorizationService) {}

  @Post('sign')
  @Roles(UserRole.SOLICITANTE, UserRole.PUERTO, UserRole.PRODUCTOR)
  @ApiOperation({ summary: 'Firmar autorización de intermediación' })
  sign(@CurrentUser('id') userId: string, @Body() dto: SignAuthorizationDto) {
    return this.authorizationService.signAuthorization(userId, dto);
  }

  @Get('status')
  @ApiOperation({ summary: 'Verificar estado de autorización' })
  getStatus(@CurrentUser('id') userId: string) {
    return this.authorizationService.getAuthorization(userId);
  }
}
