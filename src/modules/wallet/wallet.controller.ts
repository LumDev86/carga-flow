import { Controller, Get, Post, Patch, Body, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../shared/enums/user-role.enum';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { UpdateBankInfoDto } from './dto/update-bank-info.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

@ApiTags('wallet')
@Controller('wallet')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
@Roles(UserRole.CHOFER, UserRole.ADMIN)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Get('balance')
  @ApiOperation({ summary: 'Obtener saldo del wallet' })
  async getBalance(@Req() req: any) {
    return this.walletService.getBalance(req.user.id);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Historial de movimientos del wallet' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getTransactions(
    @Req() req: any,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.walletService.getTransactions(req.user.id, { limit, offset });
  }

  // --- Bank info ---

  @Get('bank-info')
  @ApiOperation({ summary: 'Obtener datos bancarios del usuario' })
  async getBankInfo(@Req() req: any) {
    const user = await this.userRepository.findOne({ where: { id: req.user.id } });
    if (!user) {
      return { cbu: null, bankAlias: null, bankName: null, bankHolderName: null };
    }
    return {
      cbu: user.cbu,
      bankAlias: user.bankAlias,
      bankName: user.bankName,
      bankHolderName: user.bankHolderName,
    };
  }

  @Patch('bank-info')
  @ApiOperation({ summary: 'Actualizar datos bancarios (CBU/alias)' })
  async updateBankInfo(@Req() req: any, @Body() dto: UpdateBankInfoDto) {
    const user = await this.userRepository.findOne({ where: { id: req.user.id } });
    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }

    if (dto.cbu !== undefined) user.cbu = dto.cbu;
    if (dto.bankAlias !== undefined) user.bankAlias = dto.bankAlias;
    if (dto.bankName !== undefined) user.bankName = dto.bankName;
    if (dto.bankHolderName !== undefined) user.bankHolderName = dto.bankHolderName;

    await this.userRepository.save(user);

    return {
      cbu: user.cbu,
      bankAlias: user.bankAlias,
      bankName: user.bankName,
      bankHolderName: user.bankHolderName,
    };
  }

  // --- Withdrawals ---

  @Post('withdraw')
  @ApiOperation({ summary: 'Solicitar retiro de fondos a CBU/alias' })
  async requestWithdrawal(@Req() req: any, @Body() dto: CreateWithdrawalDto) {
    return this.walletService.createWithdrawalRequest(
      req.user.id,
      dto.amount,
      dto.note,
    );
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'Mis solicitudes de retiro' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getMyWithdrawals(
    @Req() req: any,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.walletService.getMyWithdrawals(req.user.id, { limit, offset });
  }
}
