import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CpeRecord } from '../entities/cpe-record.entity';
import { CpeAuditLog } from '../entities/cpe-audit-log.entity';
import { AfipService } from './afip.service';
import { AfipDelegationService } from './afip-delegation.service';
import { CpeMappingService } from './cpe-mapping.service';
import { CpeStatus } from '../../../shared/enums/cpe-status.enum';
import { CpeType } from '../../../shared/enums/cpe-type.enum';
import { TripStatus } from '../../../shared/enums/trip-status.enum';
import { Trip } from '../../trips/entities/trip.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';

@Injectable()
export class CpeService {
  private readonly logger = new Logger(CpeService.name);

  constructor(
    @InjectRepository(CpeRecord)
    private readonly cpeRecordRepository: Repository<CpeRecord>,
    @InjectRepository(CpeAuditLog)
    private readonly auditLogRepository: Repository<CpeAuditLog>,
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
    private readonly afipService: AfipService,
    private readonly delegationService: AfipDelegationService,
    private readonly mappingService: CpeMappingService,
  ) {}

  async createAndAuthorizeCpe(
    tripId: string,
    userId: string,
    options?: {
      sucursal?: number;
      pesoBruto?: number;
      pesoTara?: number;
      pesoNeto?: number;
      trailerPlate?: string;
    },
  ): Promise<CpeRecord> {
    // 1. Load trip with relations
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: ['requester', 'driver'],
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    // 2. Validate trip status
    const validStatuses = [TripStatus.ACCEPTED, TripStatus.IN_TRANSIT];
    if (!validStatuses.includes(trip.status)) {
      throw new BadRequestException(
        `El viaje debe estar en estado ACCEPTED o IN_TRANSIT. Estado actual: ${trip.status}`,
      );
    }

    // 3. Validate requester has CUIT
    if (!trip.requester?.cuit) {
      throw new BadRequestException('El solicitante no tiene CUIT registrado');
    }

    // 4. Validate caller is the requester (ownership check)
    if (trip.requesterId !== userId) {
      throw new ForbiddenException(
        'Solo el solicitante del viaje puede emitir la CPE',
      );
    }

    // 5. Check existing CPE for this trip
    const existingCpe = await this.cpeRecordRepository.findOne({
      where: { tripId },
    });
    if (existingCpe && existingCpe.status === CpeStatus.AUTHORIZED) {
      throw new BadRequestException('Este viaje ya tiene una CPE autorizada');
    }

    // 6. Get driver's vehicle
    let vehicle: Vehicle | null = null;
    if (trip.driverId) {
      vehicle = await this.vehicleRepository.findOne({
        where: { userId: trip.driverId, isActive: true },
      });
    }
    if (!vehicle) {
      throw new BadRequestException('El chofer no tiene vehículo activo registrado');
    }

    // 7. Verify delegation — busca por el requesterId (el dador), no por quien llama
    const delegation = await this.delegationService.getDelegationForUser(trip.requesterId);
    if (!delegation) {
      throw new ForbiddenException(
        'No hay delegación AFIP verificada para el solicitante. El dador debe verificar la delegación del servicio CPE primero.',
      );
    }

    // 8. Get next nroOrden
    const cuitNum = Number(delegation.cuitDelegante.replace(/-/g, ''));
    const sucursal = options?.sucursal ?? 1;
    let nroOrden: number;
    try {
      const lastNroOrden = await this.afipService.consultarUltimoNroOrden(cuitNum, sucursal);
      nroOrden = lastNroOrden + 1;
    } catch (error: any) {
      this.logger.error('Error obteniendo último nro orden', error);
      throw new BadRequestException(`Error consultando AFIP: ${error.message}`);
    }

    // 9. Build CPE payload
    const payload = this.mappingService.buildCpePayload(trip, vehicle, delegation, {
      sucursal,
      nroOrden,
      pesoBruto: options?.pesoBruto,
      pesoTara: options?.pesoTara,
      pesoNeto: options?.pesoNeto,
      trailerPlate: options?.trailerPlate,
    });

    // 10. Create or update CpeRecord
    let cpeRecord = existingCpe || this.cpeRecordRepository.create({
      tripId,
      cpeType: CpeType.AUTOMOTOR,
      cuitSolicitante: delegation.cuitDelegante,
      sucursal,
    });

    cpeRecord.status = CpeStatus.PENDING_AUTHORIZATION;
    cpeRecord.nroOrden = nroOrden;
    cpeRecord.requestPayload = payload;
    cpeRecord = await this.cpeRecordRepository.save(cpeRecord);

    // 11. Call AFIP
    try {
      const response = await this.afipService.autorizarCpeAutomotor(payload);

      cpeRecord.responsePayload = response;

      if (response?.cabecera?.nroCTG || response?.nroCTG) {
        cpeRecord.status = CpeStatus.AUTHORIZED;
        cpeRecord.cpeNumber = String(response.cabecera?.nroCTG || response.nroCTG);
        cpeRecord.authorizedAt = new Date();
        cpeRecord.afipErrorCode = null;
        cpeRecord.afipErrorMessage = null;

        // Update trip with carta de porte info
        if (response.pdfUrl || response.pdf_url) {
          cpeRecord.pdfUrl = response.pdfUrl || response.pdf_url;
          await this.tripRepository.update(tripId, {
            cartaDePorteUrl: cpeRecord.pdfUrl,
          });
        }
      } else {
        const errors = response?.arrayErrores?.codigoDescripcion;
        const firstError = Array.isArray(errors) ? errors[0] : errors;
        cpeRecord.status = CpeStatus.ERROR;
        cpeRecord.afipErrorCode = String(firstError?.codigo || 'UNKNOWN');
        cpeRecord.afipErrorMessage = firstError?.descripcion || 'Error desconocido de AFIP';
      }

      cpeRecord = await this.cpeRecordRepository.save(cpeRecord);

      // Audit log
      await this.createAuditLog(cpeRecord.id, 'AUTHORIZE', userId, payload, response);

      return cpeRecord;
    } catch (error: any) {
      cpeRecord.status = CpeStatus.ERROR;
      cpeRecord.afipErrorCode = error.code || 'EXCEPTION';
      cpeRecord.afipErrorMessage = error.message;
      await this.cpeRecordRepository.save(cpeRecord);

      await this.createAuditLog(cpeRecord.id, 'AUTHORIZE_ERROR', userId, payload, null, error.message);

      throw new BadRequestException(`Error al autorizar CPE: ${error.message}`);
    }
  }

  async voidCpe(cpeRecordId: string, userId: string, reason: string): Promise<CpeRecord> {
    const cpeRecord = await this.cpeRecordRepository.findOne({
      where: { id: cpeRecordId },
      relations: ['trip'],
    });

    if (!cpeRecord) {
      throw new NotFoundException('Registro CPE no encontrado');
    }

    // Ownership check
    if (cpeRecord.trip?.requesterId !== userId) {
      throw new ForbiddenException('Solo el solicitante del viaje puede anular la CPE');
    }

    if (cpeRecord.status !== CpeStatus.AUTHORIZED) {
      throw new BadRequestException('Solo se pueden anular CPEs autorizadas');
    }

    if (!cpeRecord.cpeNumber) {
      throw new BadRequestException('La CPE no tiene número asignado');
    }

    const cuitNum = Number(cpeRecord.cuitSolicitante?.replace(/-/g, '') || '0');

    try {
      const response = await this.afipService.anularCpe({
        cartaPorte: Number(cpeRecord.cpeNumber),
        cuitSolicitante: cuitNum,
      });

      cpeRecord.status = CpeStatus.VOIDED;
      cpeRecord.voidedAt = new Date();
      cpeRecord.responsePayload = { ...cpeRecord.responsePayload, void: response };

      await this.cpeRecordRepository.save(cpeRecord);
      await this.createAuditLog(cpeRecord.id, 'VOID', userId, { reason }, response);

      return cpeRecord;
    } catch (error: any) {
      await this.createAuditLog(cpeRecord.id, 'VOID_ERROR', userId, { reason }, null, error.message);
      throw new BadRequestException(`Error al anular CPE: ${error.message}`);
    }
  }

  async queryCpe(cpeRecordId: string): Promise<CpeRecord> {
    const cpeRecord = await this.cpeRecordRepository.findOne({
      where: { id: cpeRecordId },
    });

    if (!cpeRecord) {
      throw new NotFoundException('Registro CPE no encontrado');
    }

    if (!cpeRecord.cpeNumber || !cpeRecord.cuitSolicitante) {
      return cpeRecord;
    }

    try {
      const cuitNum = Number(cpeRecord.cuitSolicitante.replace(/-/g, ''));
      const response = await this.afipService.consultarCpe({
        cartaPorte: Number(cpeRecord.cpeNumber),
        cuitSolicitante: cuitNum,
      });

      cpeRecord.responsePayload = response;
      return this.cpeRecordRepository.save(cpeRecord);
    } catch {
      return cpeRecord;
    }
  }

  async getCpeByTrip(tripId: string): Promise<CpeRecord | null> {
    return this.cpeRecordRepository.findOne({
      where: { tripId },
      relations: ['auditLogs'],
    });
  }

  async getCpeHistory(cpeRecordId: string): Promise<CpeAuditLog[]> {
    return this.auditLogRepository.find({
      where: { cpeRecordId },
      order: { createdAt: 'DESC' },
      relations: ['performedBy'],
    });
  }

  private async createAuditLog(
    cpeRecordId: string,
    action: string,
    performedById: string,
    requestData: Record<string, any> | null,
    responseData: Record<string, any> | null,
    errorMessage?: string,
  ): Promise<void> {
    const log = this.auditLogRepository.create({
      cpeRecordId,
      action,
      performedById,
      requestData,
      responseData,
      errorMessage: errorMessage || null,
    });
    await this.auditLogRepository.save(log);
  }
}
