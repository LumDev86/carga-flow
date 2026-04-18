import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { TripFuelAdjustment } from '../entities/trip-fuel-adjustment.entity';
import { Trip } from '../../trips/entities/trip.entity';
import { User } from '../../users/entities/user.entity';
import {
  FuelAdjustmentNotification,
  NotificationChannel,
  NotificationStatus,
} from '../entities/fuel-adjustment-notification.entity';
import { AdjustmentPolicy } from '../../../shared/enums/adjustment-policy.enum';

/**
 * Sends legally-compliant notifications (email + HTML receipt) to the
 * dador for every non-SILENT fuel adjustment. Persists each attempt in
 * fuel_adjustment_notifications for audit (ADR-012).
 *
 * Silent adjustments are never emailed (just in-app), per policy.
 */
@Injectable()
export class FuelAdjustmentEmailService {
  private readonly logger = new Logger(FuelAdjustmentEmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Trip) private readonly tripRepo: Repository<Trip>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(FuelAdjustmentNotification)
    private readonly notifRepo: Repository<FuelAdjustmentNotification>,
  ) {
    const host = config.get<string>('SMTP_HOST');
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    if (host && user && pass && user !== 'your-email@gmail.com') {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(config.get<string>('SMTP_PORT') || '587', 10),
        secure: config.get<string>('SMTP_SECURE') === 'true',
        auth: { user, pass },
      });
    } else {
      this.logger.warn('SMTP not configured — fuel adjustment emails will be logged only');
    }
  }

  /**
   * Fire-and-forget email for a newly-created adjustment.
   * Does not throw — errors are logged and recorded in the audit table.
   */
  async sendForAdjustment(adjustment: TripFuelAdjustment): Promise<void> {
    if (adjustment.policyApplied === AdjustmentPolicy.SILENT) return;

    let notifRow: FuelAdjustmentNotification | null = null;
    try {
      const trip = await this.tripRepo.findOne({ where: { id: adjustment.tripId } });
      if (!trip) {
        this.logger.warn(`sendForAdjustment: trip ${adjustment.tripId} not found`);
        return;
      }
      const dador = await this.userRepo.findOne({ where: { id: trip.requesterId } });
      if (!dador?.email) {
        this.logger.warn(
          `sendForAdjustment: dador ${trip.requesterId} has no email, skipping`,
        );
        return;
      }

      notifRow = this.notifRepo.create({
        adjustmentId: adjustment.id,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.SENT,
      });
      await this.notifRepo.save(notifRow);

      const html = this.buildHtml(adjustment, trip, dador);
      const subject = this.buildSubject(adjustment);

      if (!this.transporter) {
        this.logger.log(
          `[SMTP OFF] Would email ${dador.email} — ${subject}`,
        );
        return;
      }

      const from = this.config.get<string>('SMTP_FROM') || 'CargaFlow <no-reply@cargaflow.com>';
      await this.transporter.sendMail({
        from,
        to: dador.email,
        subject,
        html,
      });

      notifRow.status = NotificationStatus.DELIVERED;
      notifRow.sentAt = new Date();
      notifRow.deliveredAt = new Date();
      await this.notifRepo.save(notifRow);
      this.logger.log(
        `Fuel adjustment ${adjustment.id} email sent to ${dador.email}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fuel adjustment email failed: ${msg}`);
      if (notifRow) {
        notifRow.status = NotificationStatus.FAILED;
        notifRow.errorMessage = msg;
        await this.notifRepo.save(notifRow).catch(() => {});
      }
    }
  }

  private buildSubject(adj: TripFuelAdjustment): string {
    const isIncrease = Number(adj.adjustmentAmount) >= 0;
    const action = adj.policyApplied === AdjustmentPolicy.EXPLICIT
      ? 'requiere tu aprobación'
      : 'se aplicó a tu envío';
    return `CargaFlow — Ajuste por combustible ${action}${
      isIncrease ? '' : ' (ahorro)'
    }`;
  }

  private buildHtml(
    adj: TripFuelAdjustment,
    trip: Trip,
    dador: User,
  ): string {
    const isIncrease = Number(adj.adjustmentAmount) >= 0;
    const amountStr = Math.abs(Number(adj.adjustmentAmount)).toLocaleString(
      'es-AR',
      { minimumFractionDigits: 2 },
    );
    const pctStr = (Number(adj.pctChange) * 100).toFixed(2);
    const oldPriceStr = Number(adj.oldPrice).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
    });
    const newPriceStr = Number(adj.newPrice).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
    });
    const kmRem = Number(adj.kmRemainingAtTrigger).toFixed(0);
    const liters = Number(adj.litersRemaining).toFixed(1);

    const policyText =
      adj.policyApplied === AdjustmentPolicy.EXPLICIT
        ? 'Dado que la variación supera el 10%, este ajuste requiere tu aprobación expresa antes de aplicarse. Por favor, ingresá a la app para aceptarlo o rechazarlo.'
        : adj.policyApplied === AdjustmentPolicy.INFORMATIVE
          ? 'Este ajuste se aplicó automáticamente. Tenés una ventana de 24 horas para solicitar una revisión desde la app si no estás de acuerdo.'
          : '';

    const deadlineText = adj.autoApplyDeadline
      ? `Fecha límite para revisión: <strong>${new Date(adj.autoApplyDeadline).toLocaleString('es-AR')}</strong>`
      : '';

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ajuste por combustible — CargaFlow</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1C1917; max-width: 600px; margin: 0 auto; padding: 24px; background: #FAFAF9; }
    .card { background: #FFFFFF; border-radius: 12px; padding: 24px; border-left: 4px solid ${isIncrease ? '#F59E0B' : '#10B981'}; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { line-height: 1.5; color: #44403C; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    td { padding: 8px 0; border-bottom: 1px solid #F5F5F4; font-size: 14px; }
    td.label { color: #78716C; }
    td.value { text-align: right; font-weight: 600; }
    .total { font-size: 22px; font-weight: 800; color: ${isIncrease ? '#B45309' : '#047857'}; }
    .policy-box { background: #FEF3C7; border-radius: 8px; padding: 12px; margin-top: 16px; font-size: 13px; color: #78350F; }
    .footer { font-size: 12px; color: #A8A29E; margin-top: 24px; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${isIncrease ? 'Ajuste por suba de gasoil' : 'Ahorro por baja de gasoil'}</h1>
    <p>Hola ${dador.firstName ?? ''}, se aplicó un ajuste proporcional al tramo restante de tu envío por la variación del precio del gasoil.</p>

    <h2 style="font-size:14px; text-transform:uppercase; color:#78716C; letter-spacing:0.5px;">Detalle del envío</h2>
    <table>
      <tr><td class="label">Envío</td><td class="value">#${trip.id.slice(0, 8)}</td></tr>
      <tr><td class="label">Origen</td><td class="value">${escapeHtml(trip.originAddress ?? '-')}</td></tr>
      <tr><td class="label">Destino</td><td class="value">${escapeHtml(trip.destinationAddress ?? '-')}</td></tr>
    </table>

    <h2 style="font-size:14px; text-transform:uppercase; color:#78716C; letter-spacing:0.5px;">Cálculo del ajuste</h2>
    <table>
      <tr><td class="label">Precio anterior</td><td class="value">$${oldPriceStr}/L</td></tr>
      <tr><td class="label">Precio nuevo</td><td class="value">$${newPriceStr}/L</td></tr>
      <tr><td class="label">Variación</td><td class="value">${Number(adj.pctChange) >= 0 ? '+' : ''}${pctStr}%</td></tr>
      <tr><td class="label">Km restantes al momento del cambio</td><td class="value">${kmRem} km</td></tr>
      <tr><td class="label">Litros estimados del tramo</td><td class="value">${liters} L</td></tr>
      <tr><td class="label">${isIncrease ? 'Costo adicional' : 'Descuento'}</td><td class="value"><span class="total">${isIncrease ? '+' : '-'}$${amountStr}</span></td></tr>
    </table>

    ${policyText ? `<div class="policy-box"><strong>Política aplicada:</strong> ${policyText}</div>` : ''}
    ${deadlineText ? `<p style="font-size:13px; color:#78716C;">${deadlineText}</p>` : ''}
  </div>

  <div class="footer">
    Este mensaje fue generado automáticamente por CargaFlow en base a la declaración aceptada al registrarse. Referencia del cambio de precio: ${adj.triggeringPriceHistoryId}<br>
    Para dudas, contactanos desde la app.
  </div>
</body>
</html>
    `.trim();
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
