import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Estados del trip en los que se deben ocultar datos sensibles.
 * Una vez ACCEPTED, los datos se muestran completos.
 */
const HIDDEN_STATUSES = ['PENDING', 'ASSIGNED', 'BROADCAST', 'EXPIRED'];

/**
 * Campos del User que se ocultan antes de la aceptación del viaje.
 */
const SENSITIVE_USER_FIELDS = [
  'phone',
  'email',
  'cuit',
  'dni',
  'address',
  'cbu',
  'bankAlias',
  'bankName',
  'bankHolderName',
  'companyTaxId',
  'companyAddress',
];

/**
 * Enmascara un string mostrando solo los últimos N caracteres.
 */
function maskString(value: string, visibleChars: number = 4): string {
  if (!value || value.length <= visibleChars) return '****';
  return '*'.repeat(value.length - visibleChars) + value.slice(-visibleChars);
}

/**
 * Sanitiza los datos sensibles de un objeto User.
 */
function sanitizeUser(user: any): any {
  if (!user || typeof user !== 'object') return user;

  const sanitized = { ...user };

  for (const field of SENSITIVE_USER_FIELDS) {
    if (sanitized[field] && typeof sanitized[field] === 'string') {
      sanitized[field] = maskString(sanitized[field]);
    }
  }

  return sanitized;
}

/**
 * Procesa un trip y oculta datos sensibles si el estado lo requiere.
 */
function sanitizeTrip(trip: any, currentUserId?: string): any {
  if (!trip || typeof trip !== 'object') return trip;

  // Si no tiene status, no es un trip
  if (!trip.status) return trip;

  // Si el estado permite ver datos completos, no sanitizar
  if (!HIDDEN_STATUSES.includes(trip.status)) return trip;

  const sanitized = { ...trip };

  // Sanitizar requester (dador) - el chofer no debe ver datos completos antes de aceptar
  if (sanitized.requester && sanitized.requesterId !== currentUserId) {
    sanitized.requester = sanitizeUser(sanitized.requester);
  }

  // Sanitizar driver - el dador no debe ver datos completos antes de aceptar
  if (sanitized.driver && sanitized.driverId !== currentUserId) {
    sanitized.driver = sanitizeUser(sanitized.driver);
  }

  return sanitized;
}

/**
 * Procesa respuestas recursivamente buscando objetos trip.
 */
function sanitizeResponse(data: any, currentUserId?: string): any {
  if (!data) return data;

  // Array de trips
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeResponse(item, currentUserId));
  }

  // Objeto con paginación (data.items o data.trips)
  if (data.items && Array.isArray(data.items)) {
    return { ...data, items: data.items.map((item: any) => sanitizeResponse(item, currentUserId)) };
  }

  // Trip individual
  if (data.status && data.requesterId) {
    return sanitizeTrip(data, currentUserId);
  }

  return data;
}

@Injectable()
export class SensitiveDataInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const currentUserId = request.user?.id;
    const currentUserRole = request.user?.rol;

    // Admins ven todo siempre
    if (currentUserRole === 'ADMIN') {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => sanitizeResponse(data, currentUserId)),
    );
  }
}
