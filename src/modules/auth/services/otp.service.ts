import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(private readonly usersService: UsersService) {}

  async generateAndSendEmailOtp(user: User): Promise<void> {
    const otp = this.generateOtpCode();
    
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await this.usersService.setEmailOtp(user.id, otp, expiresAt);

    await this.sendEmailOtp(user.email, otp);

    this.logger.log(`OTP de email generado para ${user.email}: ${otp}`);
  }

  async generateAndSendPhoneOtp(user: User): Promise<void> {
    const otp = this.generateOtpCode();
    
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    await this.usersService.setPhoneOtp(user.id, otp, expiresAt);

    await this.sendPhoneOtp(user.phone, otp);

    this.logger.log(`OTP de teléfono generado para ${user.phone}: ${otp}`);
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
