import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Patch,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { AuthService } from './services/auth.service';
import { StorageService } from '../../common/storage/storage.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { UpdateUserDto } from '../users/dto/update-user.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly storageService: StorageService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Registrar nuevo usuario' })
  @ApiResponse({ 
    status: 201, 
    description: 'Usuario registrado exitosamente',
  })
  @ApiResponse({ 
    status: 409, 
    description: 'Email ya registrado',
  })
  async register(@Body() registerDto: RegisterDto) {
    return await this.authService.register(registerDto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ 
    status: 200, 
    description: 'Login exitoso',
    type: AuthResponseDto,
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Credenciales inválidas',
  })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return await this.authService.login(loginDto);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar código OTP',
    description: '⚠️ ENDPOINT NO IMPLEMENTADO - Por el momento la verificación OTP está deshabilitada para facilitar pruebas. Los usuarios pueden hacer login directamente después del registro sin verificar email/teléfono.',
    deprecated: true,
  })
  @ApiResponse({
    status: 200,
    description: 'OTP verificado exitosamente',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Código OTP inválido o expirado',
  })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto): Promise<AuthResponseDto> {
    return await this.authService.verifyOtp(verifyOtpDto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token usando refresh token' })
  @ApiResponse({ 
    status: 200, 
    description: 'Token renovado exitosamente',
    type: AuthResponseDto,
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Refresh token inválido o expirado',
  })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<AuthResponseDto> {
    return await this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cerrar sesión (revocar refresh token)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Sesión cerrada exitosamente',
  })
  async logout(
    @CurrentUser('id') userId: string,
    @Body() refreshTokenDto: RefreshTokenDto,
  ) {
    return await this.authService.logout(userId, refreshTokenDto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener información del usuario autenticado' })
  @ApiResponse({
    status: 200,
    description: 'Información del usuario',
  })
  async getProfile(@CurrentUser() user: User) {
    return user;
  }

  @Patch('profile')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Actualizar perfil del usuario autenticado' })
  @ApiResponse({
    status: 200,
    description: 'Perfil actualizado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos',
  })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return await this.authService.updateProfile(userId, updateUserDto);
  }

  @Post('avatar')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Subir o actualizar foto de perfil' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: 'Avatar actualizado exitosamente',
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const avatarUrl = await this.storageService.uploadFile(file, `avatars/${userId}`);
    return await this.authService.updateAvatar(userId, avatarUrl);
  }
}
