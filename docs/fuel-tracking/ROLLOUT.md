# Rollout Plan — Fuel Tracking

## Principios

1. **Deploy seguro**: todo detrás de feature flags, OFF por default
2. **Reversibilidad**: rollback sin código, solo flags
3. **Gradualidad**: por porcentaje de usuarios, con ventanas de observación
4. **Observabilidad**: métricas antes de escalar
5. **Zero downtime**: migrations non-blocking, compat con versión anterior

## Fases de rollout

### R0 — Deploy silencioso (día 0)

- Merge y deploy del código con:
  - `FUEL_TRACKING_ENABLED = false`
  - `FUEL_AUTO_APPLY_ENABLED = false`
  - `FUEL_ROLLOUT_PCT = 0`
- Correr migrations (idempotentes)
- Smoke test con admin: crear price_history manualmente, verificar que no rompe nada en viajes
- **Estado: sistema invisible para usuarios**

### R1 — Admin-only (día 1-2)

- Admin actualiza precios desde CRM, verifica que no afectan viajes
- Ver métricas:
  - `fuel_price_updates_total` incrementa
  - `fuel_adjustments_total` = 0 (esperado, no hay flag)
- Verificar audit trail en `fuel_price_history`

### R2 — Feature enabled con rollout 10% (día 3-4)

- `FUEL_TRACKING_ENABLED = true`
- `FUEL_AUTO_APPLY_ENABLED = true` (política escalonada)
- `FUEL_ROLLOUT_PCT = 10`
- Nuevos trips de dadores en ese 10% nacen REALTIME si cumplen distancia
- Trips existentes siguen FIXED
- **Ventana de monitoreo: 48h**
- Métricas a vigilar:
  - `fuel_adjustments_total{status}` — ver distribución
  - `fuel_recalc_duration_seconds` p95 < 3s
  - Errors rate < 1%
  - Complaints en soporte

### R3 — Rollout 50% (día 5-6)

- Si R2 limpio → `FUEL_ROLLOUT_PCT = 50`
- 48h monitoreo

### R4 — Rollout 100% GA (día 7+)

- `FUEL_ROLLOUT_PCT = 100`
- Toda la nueva cohorte tiene feature
- Legacy trips siguen FIXED
- Comunicación oficial a usuarios: email + in-app notice

### R5 — Evaluación y tuning (día 14+)

- Revisar métricas semanales
- Ajustar thresholds si feedback lo justifica
- Evaluar V2 (integración API externa)

---

## Criterios de escalamiento

Para pasar de R2 → R3:

| Métrica | Umbral |
|---|---|
| Error rate de endpoint admin | < 1% |
| Error rate de worker | < 2% |
| p95 recalc duration | < 3s |
| Trips con ajuste rechazado | < 20% |
| Quejas en soporte | < 5 |

Para pasar de R3 → R4:

| Métrica | Umbral |
|---|---|
| Todos los anteriores | Mantienen |
| Trips con pricing_mode=REALTIME que completaron OK | > 95% |
| Disputas legales generadas | 0 |

---

## Criterios de rollback

Si en cualquier fase:

| Señal | Acción |
|---|---|
| Error rate worker > 5% | Set `FUEL_AUTO_APPLY_ENABLED=false` (degrada a PROPOSED) |
| Error rate worker > 15% | Set `FUEL_TRACKING_ENABLED=false` (rollback completo) |
| Bug en cálculo de ajuste | Set `FUEL_TRACKING_ENABLED=false` + hotfix |
| Quejas masivas de usuarios | Investigar, considerar bajar `FUEL_ROLLOUT_PCT` |
| Inconsistencia en liquidación | Stop + investigate (es crítico financiero) |

El rollback NO borra datos. El histórico en `fuel_price_history` y ajustes ya aplicados permanecen auditables. Al re-enable, no re-procesa viajes ya cerrados.

---

## Migrations — estrategia

### Migration 001: enums

```sql
CREATE TYPE fuel_type_enum AS ENUM ('COMUN', 'PREMIUM');
CREATE TYPE fuel_source_enum AS ENUM ('MANUAL_ADMIN','API_YPF','API_ENARGAS','SYSTEM_ROLLBACK');
CREATE TYPE adjustment_status_enum AS ENUM ('PROPOSED','AUTO_APPLIED','ACCEPTED','REJECTED','EXPIRED');
CREATE TYPE adjustment_policy_enum AS ENUM ('SILENT','INFORMATIVE','EXPLICIT');
CREATE TYPE pricing_mode_enum AS ENUM ('FIXED','REALTIME');
```

Idempotente con `CREATE TYPE ... IF NOT EXISTS` pattern usando DO block.

### Migration 002: tablas nuevas

```sql
CREATE TABLE IF NOT EXISTS fuel_price_history (...);
CREATE TABLE IF NOT EXISTS trip_fuel_snapshots (...);
CREATE TABLE IF NOT EXISTS trip_fuel_adjustments (...);
CREATE TABLE IF NOT EXISTS trip_location_history (...);
CREATE TABLE IF NOT EXISTS integration_outbox (...);
CREATE TABLE IF NOT EXISTS feature_flags (...);
```

Índices también con `CREATE INDEX IF NOT EXISTS ...`

### Migration 003: alter existing

```sql
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS fuel_consumption DECIMAL(6,2),
  ADD COLUMN IF NOT EXISTS fuel_type fuel_type_enum DEFAULT 'COMUN';

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS fuel_snapshot_id UUID,
  ADD COLUMN IF NOT EXISTS pricing_mode pricing_mode_enum DEFAULT 'REALTIME',
  ADD COLUMN IF NOT EXISTS base_fuel_cost DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS total_fuel_adjustment DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_final_amount DECIMAL(10,2);
```

Se agrega FK `trips.fuel_snapshot_id → trip_fuel_snapshots(id)` después de que la tabla exista.

### Migration 004: seeds

```sql
INSERT INTO pricing_parameters (key, value, description, category)
VALUES
  ('fuel_threshold_silent_pct', 0.03, '...', 'COMBUSTIBLE'),
  ...
ON CONFLICT (key) DO NOTHING;

INSERT INTO feature_flags (key, value, description)
VALUES
  ('FUEL_TRACKING_ENABLED', 'false', '...'),
  ...
ON CONFLICT (key) DO NOTHING;
```

### Migration 005: seeds precios iniciales

Opcional: pre-cargar un row inicial en `fuel_price_history` con precio actual del mercado (consultar al admin el valor real de YPF al día del deploy).

### Down migrations

Documentadas pero no usadas en producción (append-only). Para dev local:

```sql
-- reverse order
ALTER TABLE trips DROP COLUMN IF EXISTS ...;
DROP TABLE IF EXISTS fuel_price_history CASCADE;
DROP TYPE IF EXISTS fuel_type_enum;
```

---

## Comunicación

### R1 (antes de habilitar)
- Reunión interna: product + soporte
- Preparar respuestas para FAQ de soporte

### R2 (10% rollout)
- Soporte en alerta por 48h
- Monitor de quejas específicas del sistema

### R4 (100%)
- Email a todos los dadores: "Nueva feature: ajuste por gasoil"
- In-app banner explicativo primera vez que aparece un ajuste
- FAQ públicas en CRM + portal + app

### Legal
- Antes de R4: actualizar declaración del dador con cláusula
- Adjuntar PDF de nueva política en registro
- Review con abogado (compliance AR)

---

## Métricas de éxito (post-GA, 30 días)

| Métrica | Target |
|---|---|
| % trips REALTIME completados sin disputas | > 98% |
| % ajustes AUTO_APPLIED aceptados/no-revertidos | > 90% |
| p95 tiempo de propagación precio → ajuste | < 60s |
| Quejas formales de dadores | < 10 total |
| Disputas legales | 0 |
| Uptime backend | > 99.9% |
| Churn de dadores atribuible a feature | 0 |

Dashboard en Grafana (o similar) a construir en Fase 1.7.
