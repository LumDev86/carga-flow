import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AfipDelegation } from '../entities/afip-delegation.entity';
import { AfipService } from './afip.service';

@Injectable()
export class AfipDelegationService {
  private readonly logger = new Logger(AfipDelegationService.name);

  constructor(
    @InjectRepository(AfipDelegation)
    private readonly delegationRepository: Repository<AfipDelegation>,
    private readonly afipService: AfipService,
  ) {}

  async checkDelegation(cuitDelegante: string): Promise<boolean> {
    if (!this.afipService.isConfigured()) {
      this.logger.warn('AFIP no configurado, delegación no verificable');
      return false;
    }

    try {
      const cuit = Number(cuitDelegante.replace(/-/g, ''));
      await this.afipService.consultarUltimoNroOrden(cuit, 1);
      return true;
    } catch (error: any) {
      this.logger.warn(`Delegación no verificada para CUIT ${cuitDelegante}: ${error.message}`);
      return false;
    }
  }

  async registerDelegation(userId: string, cuit: string): Promise<AfipDelegation> {
    // Check if delegation already exists
    let delegation = await this.delegationRepository.findOne({
      where: { userId, cuitDelegante: cuit, serviceName: 'wscpe' },
    });

    if (delegation) {
      delegation.isActive = true;
      delegation.verifiedAt = new Date();
    } else {
      delegation = this.delegationRepository.create({
        userId,
        cuitDelegante: cuit,
        serviceName: 'wscpe',
        isActive: true,
        verifiedAt: new Date(),
      });
    }

    return this.delegationRepository.save(delegation);
  }

  async getDelegationForUser(userId: string): Promise<AfipDelegation | null> {
    return this.delegationRepository.findOne({
      where: { userId, isActive: true, serviceName: 'wscpe' },
      order: { verifiedAt: 'DESC' },
    });
  }

  async verifyAndRegister(userId: string, cuit: string): Promise<{ verified: boolean; delegation?: AfipDelegation }> {
    const verified = await this.checkDelegation(cuit);
    if (!verified) {
      return { verified: false };
    }

    const delegation = await this.registerDelegation(userId, cuit);
    return { verified: true, delegation };
  }
}
