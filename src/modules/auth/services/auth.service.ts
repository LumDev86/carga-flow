import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../../users/users.service';
import { OtpService } from './otp.service';
import { RefreshToken } from '../../users/entities/refresh-token.entity';
import { User } from '../../users/entities/user.entity';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { VerifyOtpDto, OtpType } from '../dto/verify-otp.dto';
import { AuthResponseDto, UserResponseDto } from '../dto/auth-response.dto';
import { JwtPayload } from '../../../shared/interfaces/jwt-payload.interface';
import { UserStatus } from '../../../shared/enums/user-status.enum';
import { UpdateUserDto } from '../../users/dto/update-user.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async register(registerDto: RegisterDto): Promise<{ message: string }> {
    const user = await this.usersService.create(registerDto);

    await this.otpService.generateAndSendEmailOtp(user);

    return {
      message: 'Usuario registrado. Por favor verifica tu email con el código enviado.',
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.estado === UserStatus.BANNED) {
      throw new UnauthorizedException('Usuario bloqueado. Contacte al administrador.');
    }

    // TODO: Descomentar en producción - Validación de email deshabilitada para pruebas
    // if (!user.emailVerified) {
    //   throw new UnauthorizedException('Por favor verifica tu email antes de iniciar sesión');
    // }

    return await this.generateAuthResponse(user);
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(verifyOtpDto.email);

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    let isValid = false;

    if (verifyOtpDto.type === OtpType.EMAIL) {
      isValid = await this.otpService.verifyEmailOtp(user.id, verifyOtpDto.code);

      if (!isValid) {
        throw new BadRequestException('Código OTP inválido o expirado');
      }

      await this.usersService.verifyEmail(user.id);
      await this.usersService.update(user.id, {
        estado: UserStatus.VERIFIED
      });

      user.emailVerified = true;
      user.estado = UserStatus.VERIFIED;

    } else if (verifyOtpDto.type === OtpType.PHONE) {
      isValid = await this.otpService.verifyPhoneOtp(user.id, verifyOtpDto.code);

      if (!isValid) {
        throw new BadRequestException('Código OTP inválido o expirado');
      }

      await this.usersService.verifyPhone(user.id);
      user.phoneVerified = true;
    }

    return await this.generateAuthResponse(user);
  }

  async refreshToken(oldRefreshToken: string): Promise<AuthResponseDto> {
    // Verificar blacklist en Redis primero (más rápido)
    const isBlacklisted = await this.isTokenBlacklisted(oldRefreshToken);
    if (isBlacklisted) {
      throw new UnauthorizedException('Refresh token revocado');
    }

    const refreshToken = await this.refreshTokenRepository.findOne({
      where: { token: oldRefreshToken },
      relations: ['user'],
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (refreshToken.isRevoked) {
      throw new UnauthorizedException('Refresh token revocado');
    }

    if (refreshToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Revocar token antiguo
    refreshToken.isRevoked = true;
    refreshToken.revokedAt = new Date();
    await this.refreshTokenRepository.save(refreshToken);

    // Agregar a blacklist
    const blacklistKey = `blacklist:refresh:${oldRefreshToken}`;
    await this.cacheManager.set(blacklistKey, 'revoked', 30 * 24 * 60 * 60 * 1000);

    return await this.generateAuthResponse(refreshToken.user);
  }

  async logout(userId: string, refreshToken: string): Promise<{ message: string }> {
    // Revocar refresh token en base de datos
    await this.refreshTokenRepository.update(
      { token: refreshToken, userId },
      { isRevoked: true, revokedAt: new Date() },
    );

    // Agregar refresh token a blacklist en Redis (TTL de 30 días)
    const blacklistKey = `blacklist:refresh:${refreshToken}`;
    await this.cacheManager.set(blacklistKey, 'revoked', 30 * 24 * 60 * 60 * 1000);

    return { message: 'Sesión cerrada exitosamente' };
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const blacklistKey = `blacklist:refresh:${token}`;
    const result = await this.cacheManager.get(blacklistKey);
    return !!result;
  }

  async revokeAllTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true, revokedAt: new Date() },
    );
  }

  async cleanExpiredTokens(): Promise<void> {
    await this.refreshTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    // Siempre retornar éxito para prevenir enumeración de emails
    if (user) {
      await this.otpService.generateAndSendPasswordResetOtp(user);
    }
    return { message: 'Si el email existe, recibirás un código para restablecer tu contraseña.' };
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BadRequestException('Código inválido o expirado');
    }
    const isValid = await this.otpService.verifyPasswordResetOtp(user.id, code);
    if (!isValid) {
      throw new BadRequestException('Código inválido o expirado');
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.usersService.update(user.id, { password: hashedPassword } as any);
    await this.revokeAllTokens(user.id);
    return { message: 'Contraseña restablecida exitosamente. Por favor inicia sesión.' };
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto): Promise<User> {
    return await this.usersService.update(userId, updateUserDto);
  }

  async updateAvatar(userId: string, avatarUrl: string): Promise<User> {
    return await this.usersService.update(userId, { avatarUrl } as any);
  }

  async requestAccountDeletion(email: string, reason?: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (user) {
      // In production, queue a deletion job or send confirmation email
      // For now, mark as pending deletion
      await this.usersService.update(user.id, { status: UserStatus.BANNED } as any);
    }
    // Always return success to avoid email enumeration
    return { message: 'Si el email está registrado, procesaremos tu solicitud dentro de los próximos 30 días.' };
  }

  async deleteAccount(userId: string): Promise<{ message: string }> {
    await this.revokeAllTokens(userId);
    await this.usersService.remove(userId);
    return { message: 'Cuenta eliminada exitosamente' };
  }

  async updateAvailability(userId: string, isAvailable: boolean): Promise<User> {
    return await this.usersService.update(userId, { isAvailable } as any);
  }

  private async generateAuthResponse(user: User): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      rol: user.rol,
      estado: user.estado,
      portId: user.portId || null,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_EXPIRATION'),
    });

    const refreshTokenValue = uuidv4();
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const refreshToken = this.refreshTokenRepository.create({
      token: refreshTokenValue,
      user: user,
      userId: user.id,
      expiresAt,
    });

    await this.refreshTokenRepository.save(refreshToken);

    const userResponse: UserResponseDto = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      rol: user.rol,
      estado: user.estado,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      walletBalance: user.walletBalance.toString(),
      avatarUrl: user.avatarUrl || null,
      hasAcceptedDeclaration: user.hasAcceptedDeclaration,
      hasSignedIntermediationAuth: user.hasSignedIntermediationAuth,
      portId: user.portId || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      user: userResponse,
    };
  }
}
