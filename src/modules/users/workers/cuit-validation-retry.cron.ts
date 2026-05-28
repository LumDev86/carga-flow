import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { User } from '../entities/user.entity';
import { AfipService } from '../../cpe/services/afip.service';
import { UsersService } from '../users.service';

/**
 * Reintenta la validación de CUIT contra AFIP para usuarios donde la primera
 * consulta falló por servicio caído (cuit_validation_error != null).
 *
 * Schedule: cada 6 h. Procesa hasta 20 usuarios por corrida para no saturar AFIP
 * si volvió de una caída y hay muchos pendientes.
 */
@Injectable()
export class CuitValidationRetryCron {
  private readonly logger = new Logger(CuitValidationRetryCron.name);
  private readonly BATCH_SIZE = 20;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly afipService: AfipService,
    private readonly usersService: UsersService,
  ) {}

  @Cron('17 */6 * * *', {
    name: 'cuit-validation-retry',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  async run(): Promise<void> {
    const pending = await this.userRepository.find({
      where: {
        cuitValidationError: Not(IsNull()),
        cuit: Not(IsNull()),
      },
      order: { cuitLastValidationAttemptAt: 'ASC' },
      take: this.BATCH_SIZE,
    });

    if (pending.length === 0) return;

    this.logger.log(`Reintentando validación CUIT para ${pending.length} usuario(s)`);

    let recovered = 0;
    let stillFailing = 0;

    for (const user of pending) {
      try {
        const result = await this.afipService.validatePadronCuit(user.cuit!);
        await this.usersService.applyCuitValidation(user.id, result);
        if (result.kind === 'valid') {
          recovered++;
        } else if (result.kind === 'invalid') {
          // CUIT que originalmente falló por AFIP caído resulta ser inválido:
          // limpiamos el error (no vale la pena reintentarlo para siempre)
          // pero no lo marcamos como verified; queda en rate-limit de cuenta nueva.
          await this.userRepository.update(user.id, {
            cuitValidationError: `INVALID:${result.reason}`.slice(0, 255),
          });
        } else {
          stillFailing++;
        }
      } catch (err) {
        stillFailing++;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`retry for user ${user.id} failed: ${msg}`);
      }
    }

    this.logger.log(
      `CuitValidationRetry done: recovered=${recovered}, stillFailing=${stillFailing}`,
    );
  }
}
