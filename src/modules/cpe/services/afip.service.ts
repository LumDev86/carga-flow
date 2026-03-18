import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isRetryableError, parseAfipErrors } from './afip-error-handler';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Afip = require('@afipsdk/afip.js');

// WSCPE endpoints
const WSCPE_URL = 'https://serviciosjava.afip.gob.ar/wscpe/services/soap';
const WSCPE_URL_TEST = 'https://fwshomo.afip.gov.ar/wscpe/services/soap';
const WSCPE_WSDL = 'wscpe.wsdl';
const WSCPE_WSDL_TEST = 'wscpe-test.wsdl';

@Injectable()
export class AfipService implements OnModuleInit {
  private readonly logger = new Logger(AfipService.name);
  private afip: any;
  private wscpe: any;
  private cuit: number;
  private isProduction: boolean;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.cuit = Number(this.configService.get<string>('AFIP_CUIT'));
    const certPath = this.configService.get<string>('AFIP_CERT_PATH', '/opt/carga-flow/certs/cert.pem');
    const keyPath = this.configService.get<string>('AFIP_KEY_PATH', '/opt/carga-flow/certs/key.pem');
    const environment = this.configService.get<string>('AFIP_ENVIRONMENT', 'homologacion');
    this.isProduction = environment === 'produccion';

    if (!this.cuit) {
      this.logger.warn('AFIP_CUIT no configurado — servicio CPE deshabilitado');
      return;
    }

    try {
      this.afip = new Afip({
        CUIT: this.cuit,
        cert: certPath,
        key: keyPath,
        production: this.isProduction,
      });

      // Crear instancia genérica de WebService para WSCPE
      this.wscpe = this.afip.WebService('wscpe', {
        service: 'wscpe',
        soapV1_2: true,
        WSDL: WSCPE_WSDL,
        WSDL_TEST: WSCPE_WSDL_TEST,
        URL: WSCPE_URL,
        URL_TEST: WSCPE_URL_TEST,
      });

      this.logger.log(`AFIP SDK inicializado — CUIT: ${this.cuit}, env: ${environment}`);
    } catch (error) {
      this.logger.error('Error inicializando AFIP SDK', error);
    }
  }

  isConfigured(): boolean {
    return !!this.wscpe || this.isDemoMode();
  }

  isDemoMode(): boolean {
    return this.configService.get<string>('AFIP_ENVIRONMENT') === 'demo';
  }

  getCuit(): number {
    return this.cuit;
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries = 3,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const errorCode = error?.code || error?.message || '';

        if (attempt < maxRetries && isRetryableError(errorCode)) {
          const delay = Math.pow(3, attempt - 1) * 1000; // 1s, 3s, 9s
          this.logger.warn(
            `${operationName} intento ${attempt}/${maxRetries} falló (${errorCode}), reintentando en ${delay}ms...`,
          );
          await new Promise((r) => setTimeout(r, delay));
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  async autorizarCpeAutomotor(data: Record<string, any>): Promise<any> {
    this.ensureConfigured();

    if (this.isDemoMode()) {
      this.logger.log('[DEMO] Simulando autorización CPE Automotor');
      const nroCTG = Math.floor(100000000 + Math.random() * 900000000);
      return {
        cabecera: { nroCTG, estado: 'A' },
        arrayErrores: null,
      };
    }

    return this.withRetry(async () => {
      this.logger.log('Autorizando CPE Automotor...');

      const { token, sign } = await this.wscpe.getTokenAuthorization();

      const params = {
        auth: {
          token,
          sign,
          cuitRepresentada: this.cuit,
        },
        ...data,
      };

      const response = await this.wscpe.executeRequest('autorizarCPEAutomotor', params);

      const errors = parseAfipErrors(response);
      if (errors.length > 0) {
        this.logger.error('Errores AFIP en autorizarCPEAutomotor', JSON.stringify(errors));
      }

      this.logger.log('CPE autorizada — respuesta recibida');
      return response;
    }, 'autorizarCpeAutomotor');
  }

  async anularCpe(data: {
    cartaPorte: number;
    cuitSolicitante: number;
  }): Promise<any> {
    this.ensureConfigured();

    if (this.isDemoMode()) {
      this.logger.log(`[DEMO] Simulando anulación CPE ${data.cartaPorte}`);
      return { resultado: 'OK' };
    }

    return this.withRetry(async () => {
      this.logger.log(`Anulando CPE ${data.cartaPorte}...`);

      const { token, sign } = await this.wscpe.getTokenAuthorization();

      const params = {
        auth: {
          token,
          sign,
          cuitRepresentada: this.cuit,
        },
        ...data,
      };

      const response = await this.wscpe.executeRequest('anularCPE', params);
      this.logger.log(`CPE ${data.cartaPorte} anulada`);
      return response;
    }, 'anularCpe');
  }

  async consultarCpe(data: {
    cartaPorte: number;
    cuitSolicitante: number;
  }): Promise<any> {
    this.ensureConfigured();

    return this.withRetry(async () => {
      this.logger.log(`Consultando CPE ${data.cartaPorte}...`);

      const { token, sign } = await this.wscpe.getTokenAuthorization();

      const params = {
        auth: {
          token,
          sign,
          cuitRepresentada: this.cuit,
        },
        ...data,
      };

      const response = await this.wscpe.executeRequest('consultarCPE', params);
      return response;
    }, 'consultarCpe');
  }

  async consultarUltimoNroOrden(cuitSolicitante: number, sucursal: number): Promise<number> {
    this.ensureConfigured();

    if (this.isDemoMode()) {
      this.logger.log(`[DEMO] Consultando último nro orden para CUIT ${cuitSolicitante}`);
      return Math.floor(Math.random() * 10000);
    }

    return this.withRetry(async () => {
      this.logger.log(`Consultando último nro orden para CUIT ${cuitSolicitante}, sucursal ${sucursal}...`);

      const { token, sign } = await this.wscpe.getTokenAuthorization();

      const params = {
        auth: {
          token,
          sign,
          cuitRepresentada: this.cuit,
        },
        cuitSolicitante,
        sucursal,
        tipoCPE: 74, // AUTOMOTOR
      };

      const response = await this.wscpe.executeRequest('consultarUltimoNroOrden', params);
      const nroOrden = response?.nroOrden ?? 0;
      this.logger.log(`Último nro orden: ${nroOrden}`);
      return Number(nroOrden);
    }, 'consultarUltimoNroOrden');
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    if (!this.isConfigured()) {
      return { ok: false, message: 'AFIP SDK no configurado' };
    }

    try {
      await this.wscpe.getTokenAuthorization();
      return { ok: true, message: 'Token WSAA válido' };
    } catch (error: any) {
      return { ok: false, message: `Error WSAA: ${error.message}` };
    }
  }

  private ensureConfigured(): void {
    if (!this.wscpe) {
      throw new Error('AFIP SDK no configurado. Verifique AFIP_CUIT, AFIP_CERT_PATH y AFIP_KEY_PATH.');
    }
  }
}
