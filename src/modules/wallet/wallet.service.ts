import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { WalletTransaction, WalletTransactionType } from './entities/wallet-transaction.entity';
import { WithdrawalRequest } from './entities/withdrawal-request.entity';
import { WithdrawalStatus } from '../../shared/enums/withdrawal-status.enum';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(WalletTransaction)
    private readonly walletTransactionRepository: Repository<WalletTransaction>,
    @InjectRepository(WithdrawalRequest)
    private readonly withdrawalRepository: Repository<WithdrawalRequest>,
    private readonly dataSource: DataSource,
  ) {}

  async creditDriver(
    userId: string,
    amount: number,
    tripId: string | null,
    description: string,
  ): Promise<WalletTransaction> {
    return this.dataSource.transaction(async (manager) => {
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

      user.walletBalance = balanceAfter;
      await manager.save(user);

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

  async debitDriver(
    userId: string,
    amount: number,
    description: string,
    type: WalletTransactionType = WalletTransactionType.DEBIT,
  ): Promise<WalletTransaction> {
    return this.dataSource.transaction(async (manager) => {
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
      if (balanceBefore < amount) {
        throw new BadRequestException('Saldo insuficiente');
      }

      const balanceAfter = balanceBefore - amount;

      user.walletBalance = balanceAfter;
      await manager.save(user);

      const transaction = manager.getRepository(WalletTransaction).create({
        userId,
        tripId: null,
        type,
        amount: -amount,
        balanceBefore,
        balanceAfter,
        description,
      });

      const saved = await manager.save(transaction);

      this.logger.log(
        `Wallet debit: user=${userId} amount=-${amount} balance=${balanceBefore}->${balanceAfter}`,
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

  // --- Withdrawal request flow ---

  async createWithdrawalRequest(
    userId: string,
    amount: number,
    note?: string,
  ): Promise<WithdrawalRequest> {
    return this.dataSource.transaction(async (manager) => {
      // Lock user row to prevent concurrent withdrawal races
      const user = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :userId', { userId })
        .getOne();

      if (!user) {
        throw new BadRequestException('Usuario no encontrado');
      }

      if (!user.cbu && !user.bankAlias) {
        throw new BadRequestException(
          'Debes configurar tu CBU o alias bancario antes de solicitar un retiro',
        );
      }

      const balance = Number(user.walletBalance);
      if (balance < amount) {
        throw new BadRequestException(
          `Saldo insuficiente. Saldo actual: $${balance.toLocaleString('es-AR')}`,
        );
      }

      // Check for existing pending withdrawals (inside the lock)
      const pendingCount = await manager.getRepository(WithdrawalRequest).count({
        where: { userId, status: WithdrawalStatus.PENDING },
      });
      if (pendingCount > 0) {
        throw new BadRequestException(
          'Ya tienes una solicitud de retiro pendiente. Esperá a que sea procesada.',
        );
      }

      // Debit wallet (inside the same transaction)
      const balanceAfter = balance - amount;
      user.walletBalance = balanceAfter;
      await manager.save(user);

      // Create wallet transaction record
      const walletTx = manager.getRepository(WalletTransaction).create({
        userId,
        tripId: null,
        type: WalletTransactionType.WITHDRAWAL,
        amount: -amount,
        balanceBefore: balance,
        balanceAfter,
        description: `Retiro solicitado - $${amount.toLocaleString('es-AR')}`,
      });
      await manager.save(walletTx);

      // Create withdrawal request with bank info snapshot
      const withdrawal = manager.getRepository(WithdrawalRequest).create({
        userId,
        amount,
        status: WithdrawalStatus.PENDING,
        bankCbu: user.cbu,
        bankAlias: user.bankAlias,
        bankName: user.bankName,
        bankHolderName: user.bankHolderName,
        adminNote: note || null,
      });

      const saved = await manager.save(withdrawal);

      this.logger.log(
        `Withdrawal request created: user=${userId} amount=${amount} balance=${balance}->${balanceAfter} id=${saved.id}`,
      );

      return saved;
    });
  }

  async getMyWithdrawals(
    userId: string,
    filters?: { limit?: number; offset?: number },
  ): Promise<{ data: WithdrawalRequest[]; total: number }> {
    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;

    const [data, total] = await this.withdrawalRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { data, total };
  }

  async processWithdrawal(
    withdrawalId: string,
    transferReference?: string,
    adminNote?: string,
  ): Promise<WithdrawalRequest> {
    const withdrawal = await this.withdrawalRepository.findOne({
      where: { id: withdrawalId },
    });

    if (!withdrawal) {
      throw new BadRequestException('Solicitud de retiro no encontrada');
    }

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException(
        `No se puede procesar una solicitud en estado ${withdrawal.status}`,
      );
    }

    withdrawal.status = WithdrawalStatus.COMPLETED;
    withdrawal.processedAt = new Date();
    withdrawal.transferReference = transferReference || null;
    withdrawal.adminNote = adminNote || withdrawal.adminNote;

    const saved = await this.withdrawalRepository.save(withdrawal);

    this.logger.log(
      `Withdrawal processed: id=${withdrawalId} user=${withdrawal.userId} amount=${withdrawal.amount} ref=${transferReference}`,
    );

    return saved;
  }

  async rejectWithdrawal(
    withdrawalId: string,
    reason: string,
    adminNote?: string,
  ): Promise<WithdrawalRequest> {
    const withdrawal = await this.withdrawalRepository.findOne({
      where: { id: withdrawalId },
    });

    if (!withdrawal) {
      throw new BadRequestException('Solicitud de retiro no encontrada');
    }

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException(
        `No se puede rechazar una solicitud en estado ${withdrawal.status}`,
      );
    }

    // Refund the amount back to wallet
    await this.creditDriver(
      withdrawal.userId,
      Number(withdrawal.amount),
      null,
      `Retiro rechazado - Fondos devueltos ($${Number(withdrawal.amount).toLocaleString('es-AR')})`,
    );

    withdrawal.status = WithdrawalStatus.REJECTED;
    withdrawal.rejectedAt = new Date();
    withdrawal.rejectionReason = reason;
    withdrawal.adminNote = adminNote || withdrawal.adminNote;

    const saved = await this.withdrawalRepository.save(withdrawal);

    this.logger.log(
      `Withdrawal rejected: id=${withdrawalId} user=${withdrawal.userId} reason=${reason}`,
    );

    return saved;
  }

  // --- Admin queries ---

  async findAllWithdrawals(filters: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<{ data: WithdrawalRequest[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const skip = (page - 1) * limit;

    const qb = this.withdrawalRepository
      .createQueryBuilder('wr')
      .leftJoinAndSelect('wr.user', 'user');

    if (filters.status) {
      qb.andWhere('wr.status = :status', { status: filters.status });
    }

    qb.orderBy('wr.createdAt', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
