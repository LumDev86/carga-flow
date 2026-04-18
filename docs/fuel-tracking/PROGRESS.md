# Fuel Tracking — Estado del proyecto

> **Última actualización:** 2026-04-18
> **Status global:** 🟢 Sistema completo desplegado en prod con feature flags OFF.
> Listo para rollout gradual cuando se decida activar.

## Resumen ejecutivo

Sistema de ajuste dinámico del precio del flete en base a la variación del precio del gasoil durante la ejecución del viaje. Incluye integración con dataset oficial del Estado (datos.energia.gob.ar) para actualización automática.

**Arquitectura:** ver `README.md`, `DESIGN.md`, `ERD.md`, `SEQUENCES.md`, `API.md`, `POLICIES.md`, `ROLLOUT.md` y los 12 ADRs en `adr/`.

---

## Fases completadas

### FASE 0 — Diseño y ADRs ✅
- 12 Architecture Decision Records documentados
- Design doc principal + ERD + sequence diagrams + API contracts + políticas de negocio + plan de rollout
- ~3500 líneas de documentación auditable

### FASE 1 — Backend ✅
| Sub-fase | Contenido |
|---|---|
| 1.1 | Migration + entidades (7 tablas nuevas, 5 enums, alter a `vehicles`/`trips`) |
| 1.2 | Services command side: `FuelPriceCommandService`, `FuelSnapshotService`, `FuelAdjustmentService`, `VehicleConsumptionService`, `KmCalculatorService`, `AdjustmentPolicyResolver` |
| 1.3 | Services query side: `FeatureFlagService`, `FuelPriceQueryService`, `FuelAdjustmentQueryService` con caché 30s + rollout per-user estable (SHA-256) |
| 1.4 | Worker async: `OutboxPollerService` (FOR UPDATE SKIP LOCKED), `FuelPriceChangeProcessor` (BullMQ), `AutoApplyDeadlineCron`, `RedisLockService` |
| 1.5 | Endpoints REST + WebSocket gateway + guards por rol |
| 1.6 | Integración con `TripsService` lifecycle (acceptTrip/completeTrip/cancelTrip/confirmFleteReceived) |
| 1.7 | `FuelTrackingMetricsService` + endpoint `/admin/fuel-tracking/metrics` |

### FASE 2 — Testing ✅
- 30 unit tests passing (`npx jest src/modules/fuel-tracking`)
- Cobertura: policy resolver (13), consumption fallback (5), km calculator (7), feature flags incl. rollout estadístico (5)

### FASE 3 — Deploy backend ✅
- Migrations corridas en Supabase (7 tablas nuevas)
- Seeds: 21 pricing_parameters + 3 feature_flags (todos OFF)
- Container `carga-flow-api` en `ssh.whapy.com:/opt/carga-flow` (port 3008)
- Smoke tests E2E: outbox → worker → adjustment → notification ✅

### FASE 4 — Frontends ✅

**4.1 CRM Admin** (`Whapy-Dev/carga-flow-crm` — `crm-cargaflow.whapy.com`)
- Ruta `/fuel-prices` con tarjetas de precio actual (COMUN + PREMIUM)
- Dialog registro con simulador de impacto pre-confirmación
- Historial paginado con filtros
- Panel de feature flags con toggle + rollout %
- Container `carga-flow-crm` (port 3200) rebuildeado 2026-04-18

**4.2 Portal Puertos** (`Whapy-Dev/carga-flow-web` — `puertos-cargaflow.whapy.com`)
- `FuelPriceWidget` read-only en dashboard con trend 7d
- Container `carga-flow-web` (port 3070) rebuildeado 2026-04-18

**4.3 Mobile App** (`LumDev86/carga-flowFront`)
- `FuelPriceBanner` en HomeTransporterScreen
- `FuelAdjustmentModal` auto-abre en ShipmentTrackingScreen
- `useTripFuelTracking` hook
- `fuelTrackingService` con todos los endpoints

### FASE 5 — QA E2E + compliance legal ✅
- Cláusula 7 agregada a la declaración del dador en RegisterScreen (texto según ADR-012)
- Push notifications: handlers para `trip:fuel_adjustment_proposed` y `trip:fuel_adjustment_applied`
- E2E validado en prod: flags ON temporal → trigger price change → outbox procesado en 4s → worker ejecutó en 940ms → email + audit trail
- Admin `admin@cargaflow.com` / `Admin2026!` creado
- Precios iniciales seed: COMUN $1950, PREMIUM $2120 (YPF Bs.As.)

### FASE 6 — Mejoras de precisión ✅
- **6.1** VehicleRegistrationScreen: campos `fuelConsumption` + `fuelType` con anti-fraude (cambios >20% vuelven vehículo a PENDING_REVIEW)
- **6.2** `useTripGpsUploader` hook: muestra 30s, batch cada 2 min, sólo chofer del trip
- **6.3** `FuelAdjustmentEmailService`: HTML inline-styled por cada adjustment no-SILENT, audit en `fuel_adjustment_notifications`

### FASE 7 — Auto-fetch precio oficial ✅
- Integración con dataset público Secretaría de Energía (`datos.energia.gob.ar`, Res. 314/2016)
- `FuelPriceAutoFetchService` con filtros por marca + provincia, mediana robusta, idempotencia por día
- `FuelPriceFetchCron` programado 06:00 AR vía `@nestjs/schedule`
- Endpoint manual: `POST /admin/fuel-tracking/autofetch/run`
- Test 2026-04-18: 14 muestras YPF Bs.As. (Común) → mediana $2177; 16 muestras Premium → mediana $2416. Registrado OK.

---

## Lo que queda por hacer

### V2 potenciales (no-bloqueantes)

| # | Ítem | Prioridad |
|---|---|---|
| V2-1 | PDF real (pdfkit o puppeteer) en lugar de HTML printable | Baja |
| V2-2 | Firma digital del PDF cumpliendo Ley 25.506 | Baja |
| V2-3 | Integración con API de YPF directa si la publican | Media |
| V2-4 | Prorrateo por GPS real con PostGIS (vs Haversine actual) | Baja |
| V2-5 | Pub/sub de Redis para invalidar caché de flags multi-pod | Baja (no hay multi-pod hoy) |
| V2-6 | Dashboard Prometheus + Grafana | Media |
| V2-7 | Bajar `supportsTablet` a true en mobile con layout específico | Fuera de scope |

### Activación de la feature (cuando lo decidas)

```bash
# Login admin
ADMIN_TOKEN=$(curl -s -X POST https://cargaflow.whapy.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@cargaflow.com","password":"Admin2026!"}' \
  | grep -oE '"accessToken":"[^"]+"' | cut -d'"' -f4)

# R1 — admin-only: solo pruebas con tu propio user
curl -X PATCH https://cargaflow.whapy.com/api/admin/feature-flags/FUEL_TRACKING_ENABLED \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"value":true}'
curl -X PATCH https://cargaflow.whapy.com/api/admin/feature-flags/FUEL_AUTO_APPLY_ENABLED \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"value":true}'

# R2 — 10% dadores (monitorear 48h)
curl -X PATCH https://cargaflow.whapy.com/api/admin/feature-flags/FUEL_ROLLOUT_PCT \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"value":10}'

# R3 — 50%, R4 — 100% (cada 48h si las métricas son buenas)

# R5 — activar cron de auto-fetch (opcional, funciona sin él)
curl -X PATCH https://cargaflow.whapy.com/api/admin/feature-flags/FUEL_AUTO_FETCH_ENABLED \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"value":true}'

# Rollback emergencia (sin deploy, surte efecto en < 30s via TTL de cache)
curl -X PATCH https://cargaflow.whapy.com/api/admin/feature-flags/FUEL_TRACKING_ENABLED \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"value":false}'
```

---

## Referencias de repositorios

| Componente | Repo | Último commit | Path server |
|---|---|---|---|
| Backend | `LumDev86/carga-flow` | `1c4d9ea` FASE 7 | `/opt/carga-flow` |
| CRM Admin | `Whapy-Dev/carga-flow-crm` | `6c8235d` FASE 4.1 | `/home/javier-dev/carga-flow-crm` |
| Portal Puertos | `Whapy-Dev/carga-flow-web` | `bf132a7` FASE 4.2 | `/home/javier-dev/carga-flow-web` |
| Mobile | `LumDev86/carga-flowFront` | `6d2868c` FASE 6.1+6.2 | Expo managed |

## URLs productivas

| Sistema | URL |
|---|---|
| Backend API | https://cargaflow.whapy.com/api |
| CRM Admin | https://crm-cargaflow.whapy.com |
| Portal Puertos | https://puertos-cargaflow.whapy.com |
| Mobile | via Expo / App Store / Play Store |

## Credenciales de testing

| Rol | Email | Password |
|---|---|---|
| Admin | admin@cargaflow.com | Admin2026! |
| Dador | review.dador@cargaflow.com | Review2026! |
| Productor | review.productor@cargaflow.com | Review2026! |
| Transportista | review.transportista@cargaflow.com | Review2026! |

## Métricas observables

```bash
GET /admin/fuel-tracking/metrics  # counters + timers + outbox + adjustments stats
GET /admin/fuel-prices/history    # audit completo
GET /admin/fuel-adjustments       # todos los ajustes con filtros
GET /admin/feature-flags          # estado actual de flags
```

## Tests

```bash
cd /opt/carga-flow
npx jest src/modules/fuel-tracking
# → 30 tests passing
```

## Deploy

```bash
# Backend
cd /opt/carga-flow && git pull origin master && docker compose up -d --build

# CRM
cd /home/javier-dev/carga-flow-crm && git pull origin main && docker compose up -d --build

# Portal
cd /home/javier-dev/carga-flow-web && git pull origin main && docker compose up -d --build

# Mobile: rebuild via EAS o Expo publish
```
