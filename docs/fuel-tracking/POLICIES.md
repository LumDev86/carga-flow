# Business Policies — Fuel Tracking

Todas las políticas están parametrizadas en `pricing_parameters` (editables runtime) y `feature_flags`. No hay hardcoding.

## 1. Threshold policy (clasificación del ajuste)

Decide cómo se aplica un cambio de precio según su magnitud relativa.

### Parámetros

| Key | Default | Descripción |
|---|---|---|
| `fuel_threshold_silent_pct` | 0.03 | Cambios ≤3% no notifican |
| `fuel_threshold_explicit_pct` | 0.10 | Cambios >10% requieren aprobación |

### Algoritmo

```
pct_change = |new_price - old_price| / old_price

if pct_change <= silent_pct:
    return SILENT → AUTO_APPLIED sin notificar
elif pct_change <= explicit_pct:
    return INFORMATIVE → AUTO_APPLIED con push + ventana revertir
else:
    return EXPLICIT → PROPOSED, requiere accept/reject
```

### Ejemplos

- Precio pasa de $1867 a $1890 → `pct=1.23%` → SILENT
- Precio pasa de $1867 a $1950 → `pct=4.44%` → INFORMATIVE
- Precio pasa de $1867 a $2100 → `pct=12.48%` → EXPLICIT

### Justificación

Estudios internos de CATAC muestran que el precio del gasoil varía 0.5-2% semanal en condiciones normales. Cambios >10% son eventos macro (devaluación, regulación). Molestar al dador con cada variación pequeña genera fatiga de notificaciones; permitir cambios grandes sin aprobación explícita genera disputas legales.

---

## 2. Grace window policy

Ventana post-ASSIGNED donde NO se generan ajustes.

### Parámetro

| Key | Default | Descripción |
|---|---|---|
| `fuel_grace_window_minutes` | 30 | minutos post-`accepted_at` |

### Algoritmo

```
if now() - trip.accepted_at < grace_window_minutes:
    skip trip (no adjustment created)
```

### Justificación

- **Protege al chofer** de oportunismo: el dador no puede "esperar" el cambio de precio justo después de aceptar.
- **Protege al dador** del mismo modo.
- Basado en tiempo de kickoff real: 30 min cubre cargado en origen + inicio del viaje.

---

## 3. Auto-apply deadline

Para `INFORMATIVE`, el dador tiene una ventana para revertir el ajuste aplicado.

### Parámetro

| Key | Default | Descripción |
|---|---|---|
| `fuel_auto_apply_deadline_hours` | 24 | Ventana para rechazar AUTO_APPLIED INFORMATIVE |

### Comportamiento

- Al crear el ajuste INFORMATIVE: `auto_apply_deadline = now() + 24h`
- Dador puede hacer `POST .../reject` hasta ese deadline
- Cron cada 5 min busca PROPOSED/AUTO_APPLIED INFORMATIVE con deadline expirado y los "confirma" (status=AUTO_APPLIED si estaba AUTO_APPLIED, EXPIRED si estaba PROPOSED)

---

## 4. Realtime qualification

Decide qué viajes usan `pricing_mode=REALTIME` vs `FIXED`.

### Parámetro

| Key | Default | Descripción |
|---|---|---|
| `fuel_realtime_min_distance_km` | 50 | Viajes <50km nacen FIXED |

### Algoritmo (en `TripsService.createTrip`)

```
if distance_km < min_distance_km:
    pricing_mode = FIXED
elif not FUEL_TRACKING_ENABLED:
    pricing_mode = FIXED
elif dador_hash % 100 >= FUEL_ROLLOUT_PCT:
    pricing_mode = FIXED  # no está en rollout
else:
    pricing_mode = REALTIME
```

### Justificación

Viajes cortos (<50km) típicamente son urbanos, duran <2h, y el precio del gasoil no varía en esa ventana. REALTIME agregaría overhead sin beneficio.

---

## 5. Vehicle consumption resolution

Chain de fallback para determinar `L/100km` del vehicle.

### Algoritmo

```
def resolve_consumption(vehicle):
    if vehicle.fuel_consumption is not None:
        return vehicle.fuel_consumption  # ← ideal

    param_key = f"fuel_consumption_default_{vehicle.equipment_type}"
    default_for_equip = pricing_params.get(param_key)
    if default_for_equip is not None:
        return default_for_equip  # ← fallback typified

    return 30.0  # ← fallback global, log warning
```

### Defaults por equipment type

| Equipment | L/100km |
|---|---|
| BITREN | 45 |
| SEMI_REMOLQUE | 35 |
| BATEA | 32 |
| TOLVA | 32 |
| ESCALABLE | 30 |
| CARROZADO | 28 |
| CAMION | 28 |
| PLAYO | 26 |
| BARANDA_FIJA | 24 |
| BARANDA_REBATIBLE | 24 |
| FURGON | 18 |
| CISTERNA | 40 |
| CAMIONETA | 14 |
| AUTO | 8 |
| MOTO | 4 |

### Fuente de los defaults

Relevamiento con referentes CATAC + manuales de fabricante. Son conservadores (tirando a consumir más) para no subestimar ajustes.

---

## 6. Cambio significativo de consumo (anti-fraude)

Cuando un chofer actualiza `vehicle.fuel_consumption` con un delta grande, el vehicle pasa a re-aprobación.

### Parámetro

| Key | Default | Descripción |
|---|---|---|
| `vehicle_fuel_change_approval_pct` | 0.20 | Cambio >20% requiere re-aprobación admin |

### Algoritmo (en `VehiclesService.updateFuelConfig`)

```
delta_pct = |new_consumption - old_consumption| / old_consumption

if delta_pct > threshold:
    vehicle.approvalStatus = PENDING_REVIEW
    notify admins
```

### Justificación

Un chofer podría setear un consumo inflado (60 L/100km en un camión normal) para que los ajustes sean mayores. Admin revisa manualmente.

---

## 7. Feature flag rollout

Control gradual del rollout.

### Flags

| Key | Tipo | Default |
|---|---|---|
| `FUEL_TRACKING_ENABLED` | boolean | `false` |
| `FUEL_AUTO_APPLY_ENABLED` | boolean | `false` |
| `FUEL_ROLLOUT_PCT` | number 0-100 | `0` |

### Efectos

- `FUEL_TRACKING_ENABLED=false` → todo el sistema desactivado, trips nacen FIXED
- `FUEL_AUTO_APPLY_ENABLED=false` → política degradada: TODO es EXPLICIT (PROPOSED, requiere approve)
- `FUEL_ROLLOUT_PCT=X` → solo el X% de dadores tienen feature activa (hash estable)

### Hash estable por usuario

```
def is_in_rollout(user_id, rollout_pct):
    hash_int = int(hashlib.sha256(user_id.encode()).hexdigest()[:8], 16)
    return (hash_int % 100) < rollout_pct
```

Garantiza que el mismo user siempre cae del mismo lado al cambiar el pct (no oscila).

---

## 8. Rollback simétrico

### Comportamiento

Si el precio BAJA, se genera ajuste NEGATIVO con la misma política.

Ejemplo:
- Precio de $1950 a $1867 → `adjustment_amount = -6972` (beneficia al dador)
- Si policy es INFORMATIVE: se aplica silenciosamente, chofer puede "rechazar" (pero raro que rechace un beneficio)

### Justificación

Ver ADR-006. Mercado de fletes requiere simetría para confianza bidireccional.

---

## 9. Edge cases documentados

### 9.1 Precio cambia 2 veces en pocos minutos

Cada cambio genera un outbox event. Cada trip recibe 2 ajustes independientes. El `total_fuel_adjustment` del trip acumula ambos.

### 9.2 Admin revierte un cambio

Se inserta nuevo row en `fuel_price_history` con `source=SYSTEM_ROLLBACK`. Genera ajuste inverso. No se borra el histórico.

### 9.3 Trip sin snapshot (creado antes del feature)

Hooks de `TripsService` crean snapshot en acceptance si no existe y cumple condiciones. Trips creados antes del deploy quedan FIXED forever.

### 9.4 Vehicle sin consumo cargado

Fallback chain resuelve. Al crear el snapshot, se persiste el valor resuelto en `snapshot.vehicle_fuel_consumption` + `snapshot.config_snapshot.consumption_source` ("vehicle" | "equipment_default" | "global_default").

### 9.5 Trip cancela mid-adjustment

Hook `on(TripCancelled)` expira todos los PROPOSED del trip. AUTO_APPLIED ya aplicados quedan (el dador ya fue notificado; se revierten en liquidación final si la cancelación es reembolsable).

### 9.6 Dador con múltiples viajes activos

Cada trip es independiente. El ajuste se aplica a cada uno según su propio snapshot. Notificación: una por trip (no batchada — prioriza claridad).

### 9.7 Chofer no registra GPS

Si `trip_location_history` está vacío o último point > 2h viejo:
- `km_traveled` se estima con `(now() - accepted_at) / ETA_duration × total_km`
- Log warning `fuel.km_estimation.fallback` para métricas
- Se usa este valor "peor-caso" hasta que vuelvan a llegar GPS points

### 9.8 Ajuste negativo que genera `actual_final_amount` < costo de combustible

Soft check: si `total_fuel_adjustment < -0.5 × base_fuel_cost` → alerta ops. Indica bug o caso raro que merece revisión manual.

---

## 10. Tuning futuro

Todos los parámetros son editables en `pricing_parameters` (solo admin). Se puede A/B testear:

- Ajustar `silent_pct` a 0.02 si la gente se queja de notificaciones ausentes
- Bajar `grace_window` a 15 min si los trips cortos generan fricciones
- Cambiar `min_distance_km` a 30 si queremos cubrir más viajes

Idealmente se hace con datos: métricas Prometheus + queries de adopción.
