import { Injectable, Logger } from '@nestjs/common';
import { Trip } from '../../trips/entities/trip.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { AfipDelegation } from '../entities/afip-delegation.entity';
import { CargoType } from '../../../shared/enums/cargo-type.enum';

// Mapeo CargoType → código AFIP grano
const CARGO_TO_AFIP_GRAIN: Record<string, number> = {
  GRANOS_DERIVADOS: 23, // Soja
  GRANEL: 5,            // Maíz (default para granel)
};

// Mapeo provincia → código AFIP
const PROVINCE_TO_AFIP_CODE: Record<string, number> = {
  'buenos aires': 1,
  'catamarca': 2,
  'chaco': 3,
  'chubut': 4,
  'córdoba': 5,
  'cordoba': 5,
  'corrientes': 6,
  'entre ríos': 7,
  'entre rios': 7,
  'formosa': 8,
  'jujuy': 9,
  'la pampa': 10,
  'la rioja': 11,
  'mendoza': 12,
  'misiones': 13,
  'neuquén': 14,
  'neuquen': 14,
  'río negro': 15,
  'rio negro': 15,
  'salta': 16,
  'san juan': 17,
  'san luis': 18,
  'santa cruz': 19,
  'santa fe': 20,
  'santiago del estero': 21,
  'tierra del fuego': 22,
  'tucumán': 23,
  'tucuman': 23,
  'ciudad autónoma de buenos aires': 0,
  'caba': 0,
};

@Injectable()
export class CpeMappingService {
  private readonly logger = new Logger(CpeMappingService.name);
  mapCargoTypeToAfipGrainCode(cargoType: CargoType): number {
    return CARGO_TO_AFIP_GRAIN[cargoType] ?? 23; // Default: Soja
  }

  mapProvinceToAfipCode(province: string | null): number {
    if (!province) return 1;
    const code = PROVINCE_TO_AFIP_CODE[province.toLowerCase().trim()];
    if (code === undefined) {
      this.logger.warn(`Provincia no mapeada: "${province}" — usando default Buenos Aires (1)`);
      return 1;
    }
    return code;
  }

  buildCpePayload(
    trip: Trip,
    vehicle: Vehicle,
    delegation: AfipDelegation,
    options: {
      sucursal?: number;
      nroOrden: number;
      pesoBruto?: number;
      pesoTara?: number;
      pesoNeto?: number;
      trailerPlate?: string;
    },
  ): Record<string, any> {
    const cuitSolicitante = Number(delegation.cuitDelegante.replace(/-/g, ''));
    const sucursal = options.sucursal ?? 1;
    const pesoBruto = options.pesoBruto ?? (Number(trip.cargoWeight) || 30000);
    const pesoTara = options.pesoTara ?? Math.round(pesoBruto * 0.4);
    const pesoNeto = options.pesoNeto ?? (pesoBruto - pesoTara);
    const trailerPlate = options.trailerPlate || vehicle.trailerPlate || '';

    return {
      cabecera: {
        tipoCartaPorte: 74, // AUTOMOTOR
        sucursal,
        nroOrden: options.nroOrden,
        cuitSolicitante,
      },
      origen: {
        codProvincia: this.mapProvinceToAfipCode(trip.originState),
        codLocalidad: 0, // Se completa con datos de referencia AFIP
        planta: null,
      },
      destino: {
        codProvincia: this.mapProvinceToAfipCode(trip.destinationState),
        codLocalidad: 0,
        planta: null,
      },
      datosGrano: {
        tipoGrano: this.mapCargoTypeToAfipGrainCode(trip.cargoType),
        pesoBruto,
        pesoTara,
        pesoNeto,
      },
      transporte: {
        cuitTransportista: trip.driver?.cuit
          ? Number(trip.driver.cuit.replace(/-/g, ''))
          : null,
        patenteVehiculo: vehicle.plate.replace(/\s/g, ''),
        patenteAcoplado: trailerPlate ? trailerPlate.replace(/\s/g, '') : null,
        kmRecorrer: Math.round(Number(trip.distanceKm) || 0),
      },
      intervinientes: {
        cuitIntermediarioFlete: null,
        cuitChofer: trip.driver?.cuit
          ? Number(trip.driver.cuit.replace(/-/g, ''))
          : null,
      },
      tarifa: {
        importeFlete: Math.round(Number(trip.price) * 100) / 100,
      },
    };
  }
}
