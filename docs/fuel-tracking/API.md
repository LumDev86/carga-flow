# API Contract — Fuel Tracking

Todos los endpoints requieren JWT válido en `Authorization: Bearer <token>`.
RolesGuard aplica según se indica.
Rate limits aplican con sliding window.

## 1. CRM Admin endpoints (role ADMIN)

### `POST /admin/fuel-prices`

Registrar un cambio de precio del gasoil. Idempotente.

**Headers:**
- `Idempotency-Key: <uuid v4>` (requerido)

**Request body:**
```json
{
  "fuelType": "COMUN" | "PREMIUM",
  "pricePerLiter": 1950.00,
  "effectiveFrom": "2026-04-17T14:00:00-03:00",
  "source": "MANUAL_ADMIN",
  "sourceRef": "Resolución YPF #123",
  "notes": "Ajuste semanal según surtidor"
}
```

**Validaciones:**
- `pricePerLiter > 0` y `< 100000` (sanity check)
- `effectiveFrom` no más de 24h en el futuro ni más de 7 días en el pasado
- `source` es enum válido
- `notes` max 500 chars

**Responses:**
- `201 Created` — nuevo registro
- `200 OK` — retry idempotente, retorna registro existente
- `400 Bad Request` — validación
- `401` — no admin
- `429 Too Many Requests` — rate limit (10/min por user)

```json
{
  "id": "uuid",
  "fuelType": "COMUN",
  "pricePerLiter": 1950.00,
  "effectiveFrom": "2026-04-17T14:00:00Z",
  "source": "MANUAL_ADMIN",
  "sourceRef": "...",
  "createdBy": "uuid",
  "createdAt": "...",
  "notes": "...",
  "affectedTripsEstimate": 42,
  "estimatedAdjustmentTotal": 125430.50
}
```

**Rate limit:** 10/min por user

---

### `GET /admin/fuel-prices/history`

Histórico paginado.

**Query params:**
- `fuelType?: COMUN | PREMIUM`
- `from?: ISO8601`
- `to?: ISO8601`
- `source?: enum`
- `page?: int default 1`
- `limit?: int default 20 max 100`

**Response 200:**
```json
{
  "items": [
    {
      "id": "...",
      "fuelType": "COMUN",
      "pricePerLiter": 1950.00,
      "effectiveFrom": "...",
      "source": "MANUAL_ADMIN",
      "sourceRef": "...",
      "createdBy": { "id": "...", "firstName": "...", "lastName": "..." },
      "createdAt": "...",
      "notes": "...",
      "pctChange": 0.0444
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 87, "totalPages": 5 }
}
```

---

### `GET /admin/fuel-prices/impact`

Simulador pre-confirmación. NO persiste nada.

**Query params:**
- `fuelType: COMUN | PREMIUM` (requerido)
- `newPrice: decimal` (requerido)

**Response 200:**
```json
{
  "currentPrice": 1867.00,
  "proposedPrice": 1950.00,
  "pctChange": 0.0444,
  "affectedTrips": {
    "total": 42,
    "byPolicy": {
      "SILENT": 10,
      "INFORMATIVE": 30,
      "EXPLICIT": 2
    }
  },
  "estimatedAdjustment": {
    "total": 125430.50,
    "avgPerTrip": 2986.44,
    "minPerTrip": 120.00,
    "maxPerTrip": 8750.00
  }
}
```

---

### `GET /admin/fuel-adjustments`

Listado de ajustes para debugging y auditoría.

**Query params:**
- `status?: enum`
- `policy?: enum`
- `tripId?: uuid`
- `triggeringPriceId?: uuid`
- `from?, to?, page?, limit?`

**Response 200:** paginado, ver shape completo en §3.

---

### `PATCH /admin/feature-flags/:key`

Actualizar feature flag.

**Body:**
```json
{ "value": true, "description": "..." }
```

---

## 2. Mobile endpoints — Dador (role SOLICITANTE | PRODUCTOR)

### `GET /trips/:id/fuel-tracking`

Estado completo del tracking de un trip.

**Ownership:** dador del trip.

**Response 200:**
```json
{
  "trip": {
    "id": "...",
    "pricingMode": "REALTIME",
    "price": 180000.00,
    "baseFuelCost": 72000.00,
    "totalFuelAdjustment": 4350.50,
    "actualFinalAmount": 184350.50
  },
  "snapshot": {
    "id": "...",
    "fuelType": "COMUN",
    "initialPricePerLiter": 1867.00,
    "vehicleFuelConsumption": 35.00,
    "estimatedTotalKm": 420.00,
    "estimatedTotalLiters": 147.00,
    "createdAt": "..."
  },
  "adjustments": [
    {
      "id": "...",
      "oldPrice": 1867.00,
      "newPrice": 1950.00,
      "pctChange": 0.0444,
      "kmTraveledAtTrigger": 180.00,
      "kmRemainingAtTrigger": 240.00,
      "litersRemaining": 84.00,
      "adjustmentAmount": 6972.00,
      "status": "AUTO_APPLIED",
      "policyApplied": "INFORMATIVE",
      "autoApplyDeadline": "2026-04-18T14:00:00Z",
      "canRevert": true,
      "createdAt": "..."
    }
  ],
  "fuelPriceTrend": [
    { "date": "2026-04-10", "pricePerLiter": 1867.00 },
    { "date": "2026-04-17", "pricePerLiter": 1950.00 }
  ]
}
```

---

### `POST /trips/:id/fuel-adjustments/:adjId/accept`

Aceptar ajuste PROPOSED o revertir rechazo de AUTO_APPLIED INFORMATIVE (dentro de ventana).

**Ownership:** dador del trip.

**Request:** body vacío o `{ "notes": "..." }`

**Response 200:**
```json
{
  "id": "...",
  "status": "ACCEPTED",
  "respondedAt": "...",
  "trip": { "totalFuelAdjustment": 11322.50 }
}
```

**Errors:**
- `404` — adjustment no existe o no pertenece al trip
- `409` — ya respondido o expirado

---

### `POST /trips/:id/fuel-adjustments/:adjId/reject`

Rechazar. Solo válido para PROPOSED (EXPLICIT) o AUTO_APPLIED INFORMATIVE dentro de ventana.

**Body:**
```json
{ "reason": "Texto con la razón" }
```

**Response 200:** ver shape de accept.

**Errors:**
- `409` — EXPIRED
- `400` — reason missing

---

## 3. Mobile endpoints — Chofer (role CHOFER)

### `PATCH /vehicles/:id/fuel-config`

Actualizar consumo y tipo combustible del vehículo.

**Ownership:** dueño del vehículo.

**Body:**
```json
{
  "fuelConsumption": 34.5,
  "fuelType": "COMUN"
}
```

**Validación:**
- `fuelConsumption` entre 3 y 100 L/100km
- Si el cambio > 20% del valor actual → requiere aprobación admin (status del vehicle vuelve a `PENDING_REVIEW`)

**Response 200:** vehicle actualizado + `approvalRequired: boolean`.

---

### `POST /trips/:id/location`

Upload batch de puntos GPS.

**Ownership:** chofer asignado al trip.

**Body:**
```json
{
  "points": [
    {
      "latitude": -32.481,
      "longitude": -58.233,
      "speedKmh": 65.4,
      "accuracyM": 8.2,
      "recordedAt": "2026-04-17T14:32:05-03:00"
    }
  ]
}
```

**Validaciones:**
- max 50 puntos por request
- `recordedAt` dentro del rango del trip (aceptado hasta delivered + 5 min)
- `accuracy` max 100m (rechaza puntos muy imprecisos)

**Response 202 Accepted** (async insert).

**Rate limit:** 30 requests/min por trip.

---

## 4. Endpoints públicos autenticados

### `GET /fuel-prices/current`

Disponible para todos los users autenticados (puertos, choferes, dadores).

**Query params:**
- `fuelType?: COMUN | PREMIUM` (default COMUN)
- `withTrend?: boolean default false`

**Response 200:**
```json
{
  "fuelType": "COMUN",
  "pricePerLiter": 1950.00,
  "effectiveFrom": "2026-04-17T14:00:00Z",
  "source": "MANUAL_ADMIN",
  "trend": [
    { "date": "2026-04-10", "pricePerLiter": 1867.00 },
    { "date": "2026-04-17", "pricePerLiter": 1950.00 }
  ]
}
```

**Caché:** 30s, invalidación por pub/sub en Redis.

---

## 5. WebSocket events (namespace `/events`)

Gateway existente extendido. Autenticación por JWT en handshake.

### Eventos emitidos por el server

| Event | Payload | Rooms |
|---|---|---|
| `fuel_price:updated` | `{ fuelType, oldPrice, newPrice, pctChange, effectiveFrom }` | global (broadcast to all) |
| `trip:fuel_snapshot_created` | `{ tripId, snapshot }` | `trip:{tripId}` |
| `trip:fuel_adjustment_proposed` | `{ tripId, adjustment }` | `trip:{tripId}`, `user:{dadorId}` |
| `trip:fuel_adjustment_applied` | `{ tripId, adjustment, newTotalAdjustment }` | `trip:{tripId}`, `user:{dadorId}`, `user:{choferId}` |
| `trip:fuel_adjustment_rejected` | `{ tripId, adjustment, reason }` | `trip:{tripId}`, `user:{choferId}`, `admin` |
| `trip:fuel_adjustment_expired` | `{ tripId, adjustment }` | `trip:{tripId}` |

### Eventos del cliente (subscribe)

Reusa los existentes:
- `trip:subscribe` con `{ tripId }` — se une al room

---

## 6. Esquemas compartidos (TypeScript)

Los tipos se publicarán en un paquete compartido:

```
packages/fuel-tracking-types/  (opcional V2)
├── index.ts
├── enums.ts
└── dto.ts
```

Para V1, se duplican los types en cada cliente con comentario `// sync with backend @ path`.

### Enums

```typescript
export enum FuelType {
  COMUN = 'COMUN',
  PREMIUM = 'PREMIUM',
}

export enum FuelSource {
  MANUAL_ADMIN = 'MANUAL_ADMIN',
  API_YPF = 'API_YPF',
  API_ENARGAS = 'API_ENARGAS',
  SYSTEM_ROLLBACK = 'SYSTEM_ROLLBACK',
}

export enum AdjustmentStatus {
  PROPOSED = 'PROPOSED',
  AUTO_APPLIED = 'AUTO_APPLIED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum AdjustmentPolicy {
  SILENT = 'SILENT',
  INFORMATIVE = 'INFORMATIVE',
  EXPLICIT = 'EXPLICIT',
}

export enum PricingMode {
  FIXED = 'FIXED',
  REALTIME = 'REALTIME',
}
```

---

## 7. Error shape global

Todos los errores siguen el shape de NestJS default:

```json
{
  "statusCode": 409,
  "message": "Adjustment already responded",
  "error": "Conflict",
  "timestamp": "2026-04-17T...",
  "path": "/trips/.../fuel-adjustments/.../accept"
}
```

Códigos de error específicos del módulo están documentados en `docs/fuel-tracking/ERRORS.md` (a crear en implementación).

---

## 8. OpenAPI

Generado automáticamente con `@nestjs/swagger`. Accesible en:
- Prod: `https://cargaflow.whapy.com/api/docs` (detrás de auth admin)
- Dev: `http://localhost:3000/api/docs`

JSON: `/api-json` para generación de clientes.

---

## 9. Versioning

- API version: `v1` implícito en el path
- Breaking changes futuros: `/v2/admin/fuel-prices` con ambos corriendo durante ventana de deprecation
- Request/response shapes: agregar campos es backward-compatible; renombrar/quitar es breaking
