import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntermediationAuth } from './entities/intermediation-auth.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthorizationService {
  constructor(
    @InjectRepository(IntermediationAuth)
    private readonly authRepo: Repository<IntermediationAuth>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async signAuthorization(userId: string, data: {
    companyName: string;
    companyCuit: string;
    representativeName?: string;
    representativeRole?: string;
  }): Promise<IntermediationAuth> {
    const existing = await this.authRepo.findOne({
      where: { userId, isActive: true },
    });
    if (existing) {
      throw new BadRequestException('Ya firmaste la autorización de intermediación');
    }

    const auth = this.authRepo.create({
      userId,
      companyName: data.companyName,
      companyCuit: data.companyCuit,
      representativeName: data.representativeName || null,
      representativeRole: data.representativeRole || null,
      signedAt: new Date(),
      isActive: true,
    });

    const saved = await this.authRepo.save(auth);
    await this.userRepo.update(userId, { hasSignedIntermediationAuth: true });
    return saved;
  }

  async getAuthorization(userId: string): Promise<IntermediationAuth | null> {
    return this.authRepo.findOne({
      where: { userId, isActive: true },
    });
  }

  async hasSignedAuthorization(userId: string): Promise<boolean> {
    const auth = await this.authRepo.findOne({
      where: { userId, isActive: true },
    });
    return !!auth;
  }
}
