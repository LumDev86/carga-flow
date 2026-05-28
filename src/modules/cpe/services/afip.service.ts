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

export type CuitValidationResult =
  | {
      kind: 'valid';
      cuit: string;
      razonSocial: string | null;
      tipoPersona: 'FISICA' | 'JURIDICA' | null;
      condicionFiscal: string | null;
      estadoClave: string;
    }
  | { kind: 'invalid'; reason: string }
  | { kind: 'unavailable'; error: string };

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
      const accessToken = this.configService.get<string>('AFIP_SDK_ACCESS_TOKEN');

      this.afip = new Afip({
        CUIT: this.cuit,
        cert: certPath,
        key: keyPath,
        production: this.isProduction,
        ...(accessToken ? { access_token: accessToken } : {}),
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

  /**
   * Valida un CUIT contra el padrón AFIP (ws_sr_constancia_inscripcion).
   * Devuelve un discriminated union con el resultado: valid / invalid / unavailable.
   * No lanza excepción por CUIT inválido o AFIP caído — el llamador decide qué hacer.
   */
  async validatePadronCuit(rawCuit: string): Promise<CuitValidationResult> {
    const normalized = (rawCuit || '').replace(/[-\s]/g, '');

    if (!/^\d{11}$/.test(normalized)) {
      return {
        kind: 'invalid',
        reason: 'El CUIT debe tener 11 dígitos. Si no tenés un CUIT, dejá el campo vacío — es opcional.',
      };
    }

    if (!isValidCuitChecksum(normalized)) {
      return {
        kind: 'invalid',
        reason: 'El CUIT ingresado no es válido. Si no tenés un CUIT, dejá el campo vacío — es opcional.',
      };
    }

    if (this.isDemoMode()) {
      this.logger.log(`[DEMO] Validando CUIT ${normalized}`);
      return {
        kind: 'valid',
        cuit: normalized,
        razonSocial: 'DEMO - Razón Social Ficticia',
        tipoPersona: normalized.startsWith('30') || normalized.startsWith('33') ? 'JURIDICA' : 'FISICA',
        condicionFiscal: 'Monotributo',
        estadoClave: 'ACTIVO',
      };
    }

    if (!this.afip) {
      return { kind: 'unavailable', error: 'AFIP SDK no configurado' };
    }

    try {
      const timeoutMs = 10_000;
      const persona: any = await Promise.race([
        this.afip.RegisterInscriptionProof.getTaxpayerDetails(Number(normalized)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AFIP_TIMEOUT')), timeoutMs),
        ),
      ]);

      if (!persona) {
        return { kind: 'invalid', reason: 'El CUIT no existe en el padrón AFIP' };
      }

      const datosGenerales = persona.datosGenerales || persona;
      const razonSocial =
        datosGenerales.razonSocial ||
        [datosGenerales.apellido, datosGenerales.nombre].filter(Boolean).join(', ') ||
        null;
      const tipoPersona =
        datosGenerales.tipoPersona === 'FISICA' || datosGenerales.tipoPersona === 'JURIDICA'
          ? datosGenerales.tipoPersona
          : null;
      const estadoClave = datosGenerales.estadoClave || 'ACTIVO';

      if (estadoClave && estadoClave !== 'ACTIVO') {
        return { kind: 'invalid', reason: `CUIT con estado ${estadoClave} en AFIP` };
      }

      const condicionFiscal = extractCondicionFiscal(persona);

      return {
        kind: 'valid',
        cuit: normalized,
        razonSocial,
        tipoPersona,
        condicionFiscal,
        estadoClave,
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.logger.warn(`validatePadronCuit ${normalized} falló: ${msg}`);
      return { kind: 'unavailable', error: msg.slice(0, 200) };
    }
  }
}

/**
 * Verifica el dígito verificador del CUIT (módulo 11).
 */
export function isValidCuitChecksum(cuit: string): boolean {
  if (!/^\d{11}$/.test(cuit)) return false;
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = cuit.split('').map((d) => Number(d));
  const sum = multipliers.reduce((acc, m, i) => acc + m * digits[i], 0);
  const mod = sum % 11;
  const expected = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;
  return expected === digits[10];
}

function extractCondicionFiscal(persona: any): string | null {
  // AFIP devuelve un array `datosMonotributo` o `datosRegimenGeneral` según el contribuyente.
  if (persona?.datosMonotributo) return 'Monotributo';
  if (persona?.datosRegimenGeneral) {
    const impuestos = persona.datosRegimenGeneral.impuesto;
    if (Array.isArray(impuestos) && impuestos.some((i: any) => i.idImpuesto === 30 || i.idImpuesto === 32)) {
      return 'Responsable Inscripto';
    }
    return 'Régimen General';
  }
  return null;
}
