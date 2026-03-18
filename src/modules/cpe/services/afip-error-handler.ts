const AFIP_ERROR_MESSAGES: Record<string, string> = {
  '1': 'Error de autenticación WSAA',
  '10': 'CUIT solicitante inválido',
  '11': 'Tipo de carta de porte inválido',
  '12': 'Sucursal inválida',
  '13': 'Número de orden inválido',
  '14': 'Datos de origen inválidos',
  '15': 'Datos de destino inválidos',
  '16': 'Datos de carga inválidos',
  '17': 'Datos de transporte inválidos',
  '18': 'Patente de vehículo inválida',
  '19': 'Patente de acoplado inválida',
  '20': 'CUIT transportista inválido',
  '21': 'Peso bruto inválido',
  '22': 'Peso tara inválido',
  '23': 'Tipo de grano inválido',
  '100': 'Error interno del servicio AFIP',
  '500': 'Servicio AFIP no disponible temporalmente',
  '501': 'Tiempo de espera agotado en AFIP',
  '1000': 'CUIT no autorizado para el servicio',
  '1001': 'Delegación no configurada',
  '1002': 'Certificado digital inválido o expirado',
};

const RETRYABLE_ERROR_CODES = new Set(['500', '501', '100', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']);

export function getAfipErrorMessage(code: string | number): string {
  const key = String(code);
  return AFIP_ERROR_MESSAGES[key] || `Error AFIP desconocido (código: ${code})`;
}

export function isRetryableError(code: string | number): boolean {
  return RETRYABLE_ERROR_CODES.has(String(code));
}

export function parseAfipErrors(response: any): { code: string; message: string }[] {
  if (!response) return [];

  const errors: { code: string; message: string }[] = [];

  if (response.arrayErrores?.codigoDescripcion) {
    const errArr = Array.isArray(response.arrayErrores.codigoDescripcion)
      ? response.arrayErrores.codigoDescripcion
      : [response.arrayErrores.codigoDescripcion];

    for (const err of errArr) {
      errors.push({
        code: String(err.codigo || ''),
        message: err.descripcion || getAfipErrorMessage(err.codigo),
      });
    }
  }

  if (response.errores?.codigoDescripcion) {
    const errArr = Array.isArray(response.errores.codigoDescripcion)
      ? response.errores.codigoDescripcion
      : [response.errores.codigoDescripcion];

    for (const err of errArr) {
      errors.push({
        code: String(err.codigo || ''),
        message: err.descripcion || getAfipErrorMessage(err.codigo),
      });
    }
  }

  return errors;
}
