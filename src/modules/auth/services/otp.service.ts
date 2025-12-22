import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_TTL = 600; // 10 minutos en segundos

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async generateAndSendEmailOtp(user: User): Promise<void> {
    const otp = this.generateOtpCode();
    const key = `otp:email:${user.id}`;

    // Guardar OTP en Redis con TTL de 10 minutos
    await this.cacheManager.set(key, otp, this.OTP_TTL * 1000);

    await this.sendEmailOtp(user.email, otp);

    this.logger.log(`OTP de email generado para ${user.email}: ${otp}`);
  }

  async generateAndSendPhoneOtp(user: User): Promise<void> {
    const otp = this.generateOtpCode();
    const key = `otp:phone:${user.id}`;

    // Guardar OTP en Redis con TTL de 10 minutos
    await this.cacheManager.set(key, otp, this.OTP_TTL * 1000);

    await this.sendPhoneOtp(user.phone, otp);

    this.logger.log(`OTP de teléfono generado para ${user.phone}: ${otp}`);
  }

  async verifyEmailOtp(userId: string, code: string): Promise<boolean> {
    const key = `otp:email:${userId}`;
    const storedOtp = await this.cacheManager.get<string>(key);

    if (!storedOtp) {
      return false;
    }

    if (storedOtp !== code) {
      return false;
    }

    // Eliminar OTP después de verificación exitosa
    await this.cacheManager.del(key);
    return true;
  }

  async verifyPhoneOtp(userId: string, code: string): Promise<boolean> {
    const key = `otp:phone:${userId}`;
    const storedOtp = await this.cacheManager.get<string>(key);

    if (!storedOtp) {
      return false;
    }

    if (storedOtp !== code) {
      return false;
    }

    // Eliminar OTP después de verificación exitosa
    await this.cacheManager.del(key);
    return true;
  }

  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async sendEmailOtp(email: string, otp: string): Promise<void> {
    this.logger.warn(`[PLACEHOLDER] Enviando OTP ${otp} al email ${email}`);
  }

  private async sendPhoneOtp(phone: string, otp: string): Promise<void> {
    this.logger.warn(`[PLACEHOLDER] Enviando OTP ${otp} al teléfono ${phone}`);
  }
}
