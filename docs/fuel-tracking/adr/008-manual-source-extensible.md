# ADR-008: Fuente manual V1, schema extensible a APIs externas V2

**Status:** Accepted
**Date:** 2026-04-17

## Contexto

¿De dónde viene el precio del gasoil que registramos? Opciones:

**A) Solo manual desde CRM**
Admin lo ingresa a mano.

**B) Solo automático vía API externa**
Ej: scraping de YPF, API de Secretaría Energía, surtidor oficial.

**C) Ambas: manual V1 + extensible a API en V2**
Schema contempla `source` enum, pero V1 solo implementa `MANUAL_ADMIN`.

## Decisión

**Opción C**.

## Rationale

### Contra (B) en V1
- **Inestabilidad de APIs externas**: YPF, Shell, Axion no tienen APIs públicas estables
- **Scraping frágil**: cambios de HTML rompen la integración
- **Delay de regulación**: los cambios oficiales tardan días en reflejarse en fuentes públicas
- **Legal**: en disputas, referenciar "vimos en la web de YPF el martes" es débil

### Contra (A) definitivo
- **Dependencia humana**: si el admin está de vacaciones, los precios se desactualizan
- **Error humano**: typos generan movimientos grandes
  - Mitigación: simulador de impacto antes de confirmar + auditoría completa

### A favor de (C)
- **Launch rápido**: V1 se pone en producción sin dependencias externas
- **Future-proof**: agregar `API_YPF` en V2 es un worker cron + entry en enum, NO migration de schema
- **Flexibilidad**: podemos mezclar (manual como respaldo si API falla)

## Consecuencias

**Positivas:**
- Schema completo desde día 0
- No necesitamos refactor para V2
- Cada precio queda con trazabilidad de origen

**Negativas:**
- En V1, dependemos de que el admin actualice semanalmente
- Necesitamos proceso operativo: "actualizar gasoil los lunes"

## Enum de sources

```sql
CREATE TYPE fuel_source_enum AS ENUM (
  'MANUAL_ADMIN',     -- V1: admin lo ingresa
  'API_YPF',          -- V2: scraping web o API oficial YPF
  'API_ENARGAS',      -- V2: regulador
  'SYSTEM_ROLLBACK'   -- cuando admin revierte un cambio
);
```

### Extensión V2

Agregar sources es non-breaking:

```sql
ALTER TYPE fuel_source_enum ADD VALUE 'API_SHELL';
ALTER TYPE fuel_source_enum ADD VALUE 'API_AXION';
```

## Procesos operativos V1

### Frecuencia de actualización

- **Mínimo**: semanal (lunes)
- **Ideal**: cuando hay cambio oficial detectado
- **Alerta**: si no hay actualización > 7 días, CRM muestra banner "Precio desactualizado"

### Quién

- Admin principal + 1 backup
- Proceso documentado en `docs/fuel-tracking/OPERATIONS.md` (a crear al deploy)

### Validación

Cada update pasa por:
1. Simulador de impacto (ver API.md §1)
2. Confirmación
3. Audit log con notes

## V2: roadmap

Cuando se implemente V2:

1. Crear `FuelPriceApiIngestor` service (cron hourly o daily)
2. Métodos `fetchFromYPF()`, `fetchFromEnargas()`
3. Circuit breaker: si la API falla, no bloquea; reintenta
4. Insertar con `source=API_YPF` si viene de YPF
5. Opcional: validar contra otros sources (si YPF y Enargas divergen >5%, no insertar auto)

## Alternativas rechazadas

**Solo manual sin enum extensible**: nos forzaría a migration en V2.

**Solo API con fallback manual**: V1 demasiado complejo para lanzar.

## Relacionado

- ADR-002 (event sourcing)
- Roadmap V2 futuro (no ADR hoy)
