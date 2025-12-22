import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
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

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
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

    const now = new Date();

    if (verifyOtpDto.type === OtpType.EMAIL) {
      if (!user.emailOtp || !user.emailOtpExpires) {
        throw new BadRequestException('No hay código OTP pendiente');
      }

      if (user.emailOtpExpires < now) {
        throw new BadRequestException('El código OTP ha expirado');
      }

      if (user.emailOtp !== verifyOtpDto.code) {
        throw new BadRequestException('Código OTP inválido');
      }

      await this.usersService.verifyEmail(user.id);
      await this.usersService.update(user.id, { 
        estado: UserStatus.VERIFIED 
      });

      user.emailVerified = true;
      user.estado = UserStatus.VERIFIED;

    } else if (verifyOtpDto.type === OtpType.PHONE) {
      if (!user.phoneOtp || !user.phoneOtpExpires) {
        throw new BadRequestException('No hay código OTP pendiente');
      }

      if (user.phoneOtpExpires < now) {
        throw new BadRequestException('El código OTP ha expirado');
      }

      if (user.phoneOtp !== verifyOtpDto.code) {
        throw new BadRequestException('Código OTP inválido');
      }

      await this.usersService.verifyPhone(user.id);
      user.phoneVerified = true;
    }

    return await this.generateAuthResponse(user);
  }

  async refreshToken(oldRefreshToken: string): Promise<AuthResponseDto> {
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

    refreshToken.isRevoked = true;
    refreshToken.revokedAt = new Date();
    await this.refreshTokenRepository.save(refreshToken);

    return await this.generateAuthResponse(refreshToken.user);
  }

  async logout(userId: string, refreshToken: string): Promise<{ message: string }> {
    await this.refreshTokenRepository.update(
      { token: refreshToken, userId },
      { isRevoked: true, revokedAt: new Date() },
    );

    return { message: 'Sesión cerrada exitosamente' };
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

  private async generateAuthResponse(user: User): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      rol: user.rol,
      estado: user.estado,
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
