# Design Doc — Fuel Tracking Real-Time

## 1. Contexto

### 1.1 Estado actual del sistema (findings)

- `PricingService.calculateQuote` usa un `fuel_coefficient = gasoil_actual / gasoil_base_comun`, snapshot al cotizar.
- Los parámetros `gasoil_base_comun`, `gasoil_base_premium`, `gasoil_actual` ya existen en `pricing_parameters`, con caché Redis TTL 5 min.
- La tabla `pricing_parameters` está **vacía en prod** — el seed nunca corrió.
- `Trip.price`, `Trip.commission`, `Trip.driverPayout` se lockean al crear el trip.
- No hay mecanismo de recalculo post-creación.
- No hay tabla de histórico GPS — solo `user.latitude/longitude` actual.
- No hay distinción runtime entre gasoil común y premium.
- `vehicles` no tiene campos de consumo ni tipo de combustible.
- Escrow con Stripe `capture_method=manual`. Liquidación tras `DELIVERED` + `confirmFleteReceived` por admin (transacción atómica con lock pesimista).

### 1.2 Dominio de negocio

- Fletes regulados por tarifas CATAC (general) y Fe.Tr.A (cerealeras). Ambas consideran combustible como componente principal.
- Margen comercial del chofer: típicamente 5-15%. Movimientos de gasoil >5% pueden borrar ese margen.
- El combustible es ~30-40% del costo total del flete.
- Sistema político argentino: cambios macro pueden generar saltos del 15-30% en un día (historico 2018, 2023).

### 1.3 Requisitos funcionales

| # | Requisito |
|---|---|
| RF-1 | El precio del gasoil debe poder actualizarse en tiempo real desde el CRM admin |
| RF-2 | Cada viaje en curso debe recalcularse automáticamente cuando el precio cambia |
| RF-3 | El ajuste debe ser **proporcional a los km restantes**, no a los recorridos |
| RF-4 | El dador debe poder aceptar o rechazar ajustes grandes |
| RF-5 | Ajustes pequeños se aplican silenciosamente (ruido de mercado) |
| RF-6 | El sistema debe ser simétrico: sube el precio y baja |
| RF-7 | Histórico de precios auditable para disputas |
| RF-8 | Liquidación al chofer debe usar el monto ajustado final |
| RF-9 | Tres UIs diferenciadas: CRM admin, portal puertos, mobile |

### 1.4 Requisitos no funcionales

| # | Requisito |
|---|---|
| RNF-1 | Latencia del endpoint `POST /admin/fuel-prices` < 200ms (dispatch async) |
| RNF-2 | Propagación del cambio al 99% de trips activos < 60s |
| RNF-3 | Zero double-adjustment (idempotencia end-to-end) |
| RNF-4 | Rollback sin deploy via feature flag |
| RNF-5 | Audit trail completo (quién, cuándo, por qué) |
| RNF-6 | Disponibilidad 99.9% (sistema actual) |
| RNF-7 | Compliance: retención precios 10 años, GPS history 90 días |

---

## 2. Arquitectura

### 2.1 Componentes (alto nivel)

```
┌───────────────────────────────────────────────────────────────┐
│                       CRM ADMIN (Next.js)                      │
│  /dashboard/fuel-prices — actualizar precio, ver impacto       │
└───────────────────────────────────────────────────────────────┘
                                │ POST /admin/fuel-prices (Idempotency-Key)
                                ▼
┌───────────────────────────────────────────────────────────────┐
│                   BACKEND NESTJS (puerto 3008)                 │
│                                                                │
│  ┌─────────────────────┐   ┌──────────────────────┐           │
│  │ FuelPriceCommand    │──▶│ fuel_price_history   │           │
│  │ Service             │   │ (append-only)        │           │
│  └─────────────────────┘   └──────────────────────┘           │
│           │ TX                                                 │
│           ▼                                                    │
│  ┌─────────────────────┐                                       │
│  │ integration_outbox  │                                       │
│  │ (PENDING events)    │                                       │
│  └─────────────────────┘                                       │
│           │ poll                                               │
│           ▼                                                    │
│  ┌─────────────────────┐   ┌──────────────────────┐           │
│  │ FuelTracking Worker │──▶│ Redis distributed    │           │
│  │ (BullMQ)            │   │ lock per tripId      │           │
│  └─────────────────────┘   └──────────────────────┘           │
│           │                                                    │
│           ▼                                                    │
│  ┌─────────────────────────────────────────────────┐           │
│  │  For each active trip (REALTIME, post-grace):    │          │
│  │    1. Calc km_remaining from trip_location_history          │
│  │    2. Apply policy (silent/informative/explicit)            │
│  │    3. Create trip_fuel_adjustment                            │
│  │    4. Emit WebSocket event                                   │
│  │    5. Send push notification                                 │
│  └─────────────────────────────────────────────────┘           │
└───────────────────────────────────────────────────────────────┘
        │                                    │
        │ WebSocket                          │ Push (Expo)
        ▼                                    ▼
┌─────────────────────┐            ┌──────────────────┐
│  MOBILE APP (RN)    │            │  DADOR dispositivo│
│  - Banner precio    │            │  push notification │
│  - Modal ajuste     │            └──────────────────┘
│  - Tracking screen  │
└─────────────────────┘
```

### 2.2 Módulos nuevos en el backend

```
src/modules/fuel-tracking/
├── fuel-tracking.module.ts
├── controllers/
│   ├── admin-fuel-prices.controller.ts     # ADMIN only
│   ├── trip-fuel-tracking.controller.ts    # SOLICITANTE, CHOFER
│   └── public-fuel-prices.controller.ts    # PUERTO, any authed
├── services/
│   ├── fuel-price-command.service.ts       # Write side
│   ├── fuel-price-query.service.ts         # Read side (cached)
│   ├── fuel-adjustment.service.ts          # Create/accept/reject
│   ├── fuel-snapshot.service.ts            # Snapshot lifecycle
│   ├── vehicle-consumption.service.ts      # Resolution with fallback
│   └── km-calculator.service.ts            # GPS integration
├── workers/
│   ├── fuel-price-change.processor.ts      # BullMQ worker
│   └── auto-apply-deadline.processor.ts    # Cron, expira PROPOSED
├── entities/
│   ├── fuel-price-history.entity.ts
│   ├── trip-fuel-snapshot.entity.ts
│   ├── trip-fuel-adjustment.entity.ts
│   ├── trip-location-history.entity.ts
│   ├── integration-outbox.entity.ts
│   └── feature-flag.entity.ts
├── dto/
│   ├── register-fuel-price.dto.ts
│   ├── respond-adjustment.dto.ts
│   └── update-vehicle-fuel-config.dto.ts
├── events/
│   ├── fuel-price-changed.event.ts
│   └── trip-fuel-adjusted.event.ts
├── listeners/
│   └── fuel-price-changed.listener.ts      # enqueue jobs
├── gateways/
│   └── fuel-tracking.gateway.ts            # WebSocket extension
└── policies/
    └── adjustment-policy.ts                # threshold/grace/auto-apply logic
```

### 2.3 Integraciones con módulos existentes

| Módulo existente | Cambio |
|---|---|
| `TripsService.createTrip` | setear `pricing_mode` según distancia, crear outbox event |
| `TripsService.acceptTrip` | crear `TripFuelSnapshot` |
| `TripsService.completeTrip` | freeze `actual_fuel_cost` = sum(adjustments ACCEPTED/AUTO_APPLIED) |
| `TripsService.confirmFleteReceived` | usar `actual_final_amount` en lugar de `price` |
| `PricingService.calculateFuelCoefficient` | leer precio por `fuel_type` del vehicle si existe |
| `VehiclesService.registerVehicle` | aceptar `fuelConsumption`, `fuelType` opcionales |
| `EventsGateway` | emitir nuevos eventos `fuel_*` |
| `GeolocationService` | exponer cálculo Haversine integrado sobre tracklog |

---

## 3. Flujos principales

### 3.1 Registro de cambio de precio (admin)

1. Admin abre CRM `/dashboard/fuel-prices`
2. Ingresa nuevo precio + notas + tipo combustible
3. UI muestra **preview de impacto**: "Afectaría a N viajes activos, ajuste total estimado $X"
4. Admin confirma
5. Request: `POST /admin/fuel-prices` con `Idempotency-Key: <uuid>`
6. Backend (mismo TX):
   - Valida precio positivo, tipo válido
   - Chequea idempotency key
   - INSERT en `fuel_price_history`
   - INSERT en `integration_outbox` con `event_type='fuel.price.changed'`
   - COMMIT
7. Backend responde 201 con el record creado
8. Worker detecta outbox → dispatch job
9. Ver flujo 3.2

### 3.2 Propagación a trips activos (worker)

1. Worker toma job `fuel.price.changed`
2. Query: trips con `status IN ('ASSIGNED','ACCEPTED','IN_TRANSIT')` AND `pricing_mode='REALTIME'` AND NOT dentro de grace window
3. Para cada trip (en paralelo, max concurrency 10):
   1. Adquirir lock Redis `fuel:recalc:trip:{tripId}` TTL 10s
   2. Cargar `trip_fuel_snapshot` del trip
   3. Calcular `km_recorridos` con Haversine integrado sobre `trip_location_history`
   4. Calcular `km_restantes = snapshot.estimated_total_km - km_recorridos`
   5. Calcular `liters_remaining = km_restantes × snapshot.vehicle_fuel_consumption / 100`
   6. Calcular `adjustment_amount = liters_remaining × (new_price - old_price)`
   7. Calcular `pct_change = (new_price - old_price) / old_price`
   8. Aplicar policy (ver §4)
   9. INSERT en `trip_fuel_adjustments` con status PROPOSED | AUTO_APPLIED
   10. Si AUTO_APPLIED: UPDATE `trips.total_fuel_adjustment += adjustment_amount`
   11. Emit WebSocket events
   12. Send push notifications
   13. Release lock
4. Si algún trip falla: retry con backoff exponencial (3 intentos), luego DLQ
5. Logs estructurados con tripId

### 3.3 Respuesta del dador (mobile)

- Caso A — `AUTO_APPLIED silent`: no se le notifica. Aparece en historial.
- Caso B — `AUTO_APPLIED informative`: push + banner en app. Ventana de 24h para "Revertir".
- Caso C — `PROPOSED explicit`: push urgente + modal bloqueante. `Accept` o `Reject` obligatorio.

Endpoints:
- `POST /trips/:id/fuel-adjustments/:adjId/accept`
- `POST /trips/:id/fuel-adjustments/:adjId/reject` (body: `reason`)

Impacto:
- Accept/AUTO_APPLIED: `trips.total_fuel_adjustment += amount`, event `trip:fuel_adjustment_applied`
- Reject: status=REJECTED, `total_fuel_adjustment` no cambia, event a admin para review

### 3.4 Cierre de viaje y liquidación

1. Chofer completa viaje → `Trip.status = DELIVERED`
2. Hook `on(TripStatusChanged → DELIVERED)`:
   - Expira todos los `trip_fuel_adjustments` PROPOSED de ese trip
   - Calcula `actual_final_amount = price + total_fuel_adjustment`
   - Freeze `actual_fuel_cost` en el snapshot
3. Admin confirma flete recibido
4. `confirmFleteReceived` usa `actual_final_amount` en lugar de `price`
5. Se acredita al driver `actual_final_amount - commission`
6. Nota: la comisión NO se ajusta (cambio de negocio futuro — se documenta en Open Questions)

---

## 4. Políticas (business logic)

Ver [POLICIES.md](./POLICIES.md) para detalle completo.

### 4.1 Thresholds

| % cambio | Política | UX |
|---|---|---|
| ≤ 3% | `SILENT` | AUTO_APPLIED, sin notificación |
| 3% < Δ ≤ 10% | `INFORMATIVE` | AUTO_APPLIED, push + banner + ventana revertir 24h |
| > 10% | `EXPLICIT` | PROPOSED, requiere accept/reject |

### 4.2 Grace window

Si `now() - trip.accepted_at < grace_window_minutes` (default 30), NO se genera ajuste.

### 4.3 Prerrequisitos para recalcular

- `pricing_mode = REALTIME`
- `status IN ('ASSIGNED','ACCEPTED','IN_TRANSIT')`
- Snapshot existe
- Feature flag `FUEL_TRACKING_ENABLED = true`
- Dador incluido en `FUEL_ROLLOUT_PCT` (hash userId)

---

## 5. Datos

Ver [ERD.md](./ERD.md).

### 5.1 Patrones clave

- **Append-only** en `fuel_price_history` (nunca UPDATE)
- **Snapshot inmutable** en `trip_fuel_snapshots` (una fila por trip)
- **Event sourcing ligero** — reconstruir precio a cualquier timestamp
- **Outbox pattern** para consistencia write → event
- **Feature flags** en tabla (no env vars) para hot-swap

### 5.2 Índices

- BRIN en `fuel_price_history.effective_from` (series temporales, costo bajo)
- Composite `(fuel_type, effective_from DESC)` para "current price"
- Partial index en `trip_fuel_adjustments(auto_apply_deadline) WHERE status='PROPOSED'` para cron
- Composite `(trip_id, recorded_at)` en `trip_location_history`

### 5.3 Retention

- `fuel_price_history` — 10 años (compliance fiscal AFIP)
- `trip_fuel_snapshots` — lifetime del trip
- `trip_fuel_adjustments` — lifetime del trip
- `trip_location_history` — 90 días (LGPD-friendly, Ley 25.326)
- `integration_outbox` — 30 días después de `processed_at`

---

## 6. Concurrencia y consistencia

### 6.1 Escenarios

**Escenario A: Admin hace doble POST en 500ms**
- Segundo request detecta misma `Idempotency-Key` → retorna el record existente, no duplica

**Escenario B: Worker recalcula trip en paralelo 2x**
- Redis lock `fuel:recalc:trip:{tripId}` TTL 10s evita ambos recalculen
- El segundo espera o skippea según estrategia (skippea: otro proceso ya lo hará)

**Escenario C: Dador acepta ajuste Y admin cambia precio de nuevo**
- `trip_fuel_adjustments.accept` usa UPDATE WHERE `status='PROPOSED'` (idempotente)
- Nuevo cambio crea NUEVO `trip_fuel_adjustments`, no modifica el anterior

**Escenario D: Trip pasa a DELIVERED mientras se procesa ajuste**
- Hook `on(TripDelivered)` expira PROPOSED adjustments del trip
- Worker, al intentar INSERT adjustment, chequea `trip.status NOT IN ('DELIVERED','CANCELLED','EXPIRED')`

**Escenario E: Chofer no tiene consumo cargado**
- `VehicleConsumptionService.resolve(vehicle)` devuelve fallback por `equipment_type`
- Si no matchea ningún equipment type → default global 30 L/100km + log warning

### 6.2 Garantías transaccionales

- Write en `fuel_price_history` + `outbox` → **misma transacción**
- Apply adjustment + `trips.total_fuel_adjustment` → **misma transacción**
- Worker: después de procesar outbox item, UPDATE `status='PROCESSED'` + `processed_at` en misma TX

---

## 7. Observability

### 7.1 Logs estructurados (JSON via pino)

Eventos a loguear con context:

```json
{
  "event": "fuel.price.registered",
  "priceId": "uuid",
  "fuelType": "COMUN",
  "oldPrice": 1867,
  "newPrice": 1950,
  "pctChange": 0.0444,
  "registeredBy": "admin-uuid",
  "idempotencyKey": "uuid"
}

{
  "event": "fuel.trip.recalculated",
  "tripId": "uuid",
  "adjustmentId": "uuid",
  "policy": "INFORMATIVE",
  "adjustmentAmount": 4350.50,
  "kmRemaining": 120.5,
  "status": "AUTO_APPLIED",
  "durationMs": 145
}

{
  "event": "fuel.adjustment.rejected",
  "tripId": "uuid",
  "adjustmentId": "uuid",
  "rejectedBy": "dador-uuid",
  "reason": "...",
  "amount": 12400
}
```

### 7.2 Métricas Prometheus

```
fuel_price_updates_total{fuel_type,source}
fuel_adjustments_total{status,policy}
fuel_recalc_duration_seconds{quantile}
fuel_active_trips_gauge
fuel_outbox_pending_gauge
fuel_worker_job_duration_seconds{quantile}
```

### 7.3 Alertas

- Outbox PENDING > 100 por más de 5 min → alerta oncall
- Recalc p95 > 5s → alerta performance
- Worker failure rate > 5% en 1h → alerta oncall
- `FUEL_TRACKING_ENABLED=true` AND no price change en 7 días → alerta ops (precio posiblemente desactualizado)

---

## 8. Security

- POST admin requiere ADMIN role + rate limit 10/min por user
- Dador endpoints requieren ownership del trip
- Chofer endpoints requieren ownership del vehicle
- Sanitización de reasons (XSS prevention en CRM)
- Idempotency keys son UUID v4 client-generated, validar formato
- No exponer IDs internos de outbox en responses

---

## 9. Open questions (decisiones futuras)

| # | Pregunta | Propuesta V2 |
|---|---|---|
| OQ-1 | ¿La comisión se ajusta cuando cambia el total? Hoy NO (fija en acceptance) | Decidir con finanzas: proporcional o fija |
| OQ-2 | ¿Precio por zona geográfica? | NO en V1, considerar si hay demanda |
| OQ-3 | ¿Integración con API YPF/Enargas? | Sí, V2 — schema ya lo soporta |
| OQ-4 | ¿Chofer puede disputar ajuste? | NO en V1, si hay disputas → canal admin |
| OQ-5 | ¿Notificación por email o solo push? | Email + PDF en V1 para compliance |

---

## 10. Dependencias externas

- **BullMQ** — ya usado en el proyecto (assignment timeouts)
- **ioredis** — ya usado para caché
- **socket.io** — ya usado
- **@nestjs/event-emitter** — agregar si no está
- **pino / nest-pino** — considerar migrar logging para estructurado

---

## 11. Riesgos técnicos

| Riesgo | Mitigación |
|---|---|
| Worker se cae → ajustes pendientes | Outbox persistente + retry con DLQ |
| Race condition entre accept y delivered | UPDATE con WHERE status='PROPOSED', hooks de estado |
| Precio vuelve atrás (rollback admin) | Genera ajuste inverso si cumple policy |
| Overflow en `total_fuel_adjustment` | CHECK constraint en columna |
| GPS inexacto o offline → km_recorridos errado | Fallback a distancia lineal Haversine + log |
| Vehicle sin consumo → cálculo incorrecto | Fallback chain: vehicle.consumption → equipment default → global default |

---

## 12. Próximos pasos

Una vez aprobado este documento:
- **FASE 1.1** — Migrations + entities (ver task #9)
- **FASE 1.2** — Command side (ver task #10)
- **FASE 1.3** — Query side (ver task #11)
- **FASE 1.4** — Worker (ver task #12)
- **FASE 1.5** — Endpoints (ver task #13)
- **FASE 1.6** — Trip lifecycle integration (ver task #14)
- **FASE 1.7** — Observability + flags (ver task #15)
