import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('wallet')
@Controller('wallet')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Obtener saldo del wallet' })
  async getBalance(@Req() req: any) {
    return this.walletService.getBalance(req.user.sub);
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
    return this.walletService.getTransactions(req.user.sub, { limit, offset });
  }
}
