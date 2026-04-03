import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import * as nodemailer from 'nodemailer';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_TTL = 600; // 10 minutos en segundos
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private configService: ConfigService,
  ) {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && user && pass && user !== 'your-email@gmail.com') {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(this.configService.get<string>('SMTP_PORT') || '587', 10),
        secure: this.configService.get<string>('SMTP_SECURE') === 'true',
        auth: { user, pass },
      });
      this.logger.log(`SMTP configurado con ${user}`);
    } else {
      this.logger.warn('SMTP no configurado — los emails se loguearan en consola');
    }
  }

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

  async generateAndSendPasswordResetOtp(user: User): Promise<void> {
    const otp = this.generateOtpCode();
    const key = `otp:password-reset:${user.id}`;

    await this.cacheManager.set(key, otp, this.OTP_TTL * 1000);

    await this.sendEmailOtp(user.email, otp);

    this.logger.log(`OTP de reset de contraseña generado para ${user.email}: ${otp}`);
  }

  async verifyPasswordResetOtp(userId: string, code: string): Promise<boolean> {
    const key = `otp:password-reset:${userId}`;
    const storedOtp = await this.cacheManager.get<string>(key);

    if (!storedOtp || storedOtp !== code) {
      return false;
    }

    await this.cacheManager.del(key);
    return true;
  }

  private async sendEmailOtp(email: string, otp: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`[SIN SMTP] OTP ${otp} para ${email} — configurar SMTP para envío real`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"CargaFlow" <${this.configService.get<string>('SMTP_USER')}>`,
        to: email,
        subject: 'Tu código de verificación - CargaFlow',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #059669; margin-bottom: 8px;">CargaFlow</h2>
            <p style="color: #475569; font-size: 15px;">Tu código de verificación es:</p>
            <div style="background: #f1f5f9; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
              <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0f172a;">${otp}</span>
            </div>
            <p style="color: #64748b; font-size: 13px;">Este código expira en 10 minutos. Si no solicitaste este código, ignorá este email.</p>
          </div>
        `,
      });
      this.logger.log(`OTP enviado por email a ${email}`);
    } catch (err) {
      this.logger.error(`Error enviando OTP a ${email}: ${err.message}`);
    }
  }

  private async sendPhoneOtp(phone: string, otp: string): Promise<void> {
    this.logger.warn(`[PLACEHOLDER] Enviando OTP ${otp} al teléfono ${phone}`);
  }
}
