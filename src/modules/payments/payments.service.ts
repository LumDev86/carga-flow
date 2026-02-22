import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Trip } from '../trips/entities/trip.entity';
import { PaymentMethodEnum } from '../../shared/enums/payment-method.enum';

@Injectable()
export class PaymentsService {
  private stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(secretKey || '', {
      apiVersion: '2026-01-28.clover',
    });
  }

  async createPaymentIntent(amount: number, currency = 'ars', metadata?: Record<string, string>) {
    if (amount <= 0) {
      throw new BadRequestException('El monto debe ser mayor a 0');
    }

    // Stripe expects amounts in the smallest currency unit (centavos for ARS)
    const amountInCents = Math.round(amount * 100);

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amountInCents,
      currency,
      metadata: metadata || {},
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  }

  async confirmTripPayment(tripId: string, paymentIntentId: string) {
    const trip = await this.tripRepository.findOne({ where: { id: tripId } });
    if (!trip) {
      throw new BadRequestException('Viaje no encontrado');
    }

    // Verify payment intent status with Stripe
    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException(`Pago no completado. Estado: ${paymentIntent.status}`);
    }

    trip.paymentMethod = PaymentMethodEnum.CARD;
    trip.paymentIntentId = paymentIntentId;
    trip.paymentStatus = 'paid';

    return this.tripRepository.save(trip);
  }

  async getPaymentStatus(paymentIntentId: string) {
    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    return {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
    };
  }
}
