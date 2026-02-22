import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('payments')
@Controller('payments')
@ApiBearerAuth('JWT-auth')
@UseGuards(RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-intent')
  @ApiOperation({ summary: 'Crear un PaymentIntent de Stripe' })
  @ApiResponse({ status: 201, description: 'PaymentIntent creado' })
  async createPaymentIntent(
    @Body() body: { amount: number; tripId?: string },
  ) {
    const metadata: Record<string, string> = {};
    if (body.tripId) {
      metadata.tripId = body.tripId;
    }

    return this.paymentsService.createPaymentIntent(
      body.amount,
      'ars',
      metadata,
    );
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirmar pago de un viaje' })
  @ApiResponse({ status: 200, description: 'Pago confirmado y asociado al viaje' })
  async confirmPayment(
    @Body() body: { tripId: string; paymentIntentId: string },
  ) {
    return this.paymentsService.confirmTripPayment(
      body.tripId,
      body.paymentIntentId,
    );
  }

  @Get(':paymentIntentId/status')
  @ApiOperation({ summary: 'Consultar estado de un pago' })
  @ApiResponse({ status: 200, description: 'Estado del pago' })
  async getPaymentStatus(
    @Param('paymentIntentId') paymentIntentId: string,
  ) {
    return this.paymentsService.getPaymentStatus(paymentIntentId);
  }
}
