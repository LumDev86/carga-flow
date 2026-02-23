import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { WalletTransaction, WalletTransactionType } from './entities/wallet-transaction.entity';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(WalletTransaction)
    private readonly walletTransactionRepository: Repository<WalletTransaction>,
    private readonly dataSource: DataSource,
  ) {}

  async creditDriver(
    userId: string,
    amount: number,
    tripId: string,
    description: string,
  ): Promise<WalletTransaction> {
    return this.dataSource.transaction(async (manager) => {
      // Lock the user row to prevent concurrent balance updates
      const user = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId })
        .getOne();

      if (!user) {
        throw new BadRequestException('Usuario no encontrado');
      }

      const balanceBefore = Number(user.walletBalance);
      const balanceAfter = balanceBefore + amount;

      // Update balance
      user.walletBalance = balanceAfter;
      await manager.save(user);

      // Create transaction record
      const transaction = manager.getRepository(WalletTransaction).create({
        userId,
        tripId,
        type: WalletTransactionType.CREDIT,
        amount,
        balanceBefore,
        balanceAfter,
        description,
      });

      const saved = await manager.save(transaction);

      this.logger.log(
        `Wallet credit: user=${userId} amount=${amount} balance=${balanceBefore}->${balanceAfter} trip=${tripId}`,
      );

      return saved;
    });
  }

  async getBalance(userId: string): Promise<{ balance: number }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }
    return { balance: Number(user.walletBalance) };
  }

  async getTransactions(
    userId: string,
    filters?: { limit?: number; offset?: number },
  ): Promise<{ data: WalletTransaction[]; total: number }> {
    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;

    const [data, total] = await this.walletTransactionRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { data, total };
  }
}
