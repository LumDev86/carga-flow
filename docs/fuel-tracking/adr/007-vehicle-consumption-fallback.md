# ADR-007: Consumo por vehículo con fallback por equipment type

**Status:** Accepted
**Date:** 2026-04-17

## Contexto

Para calcular un ajuste, necesitamos `vehicle.fuel_consumption` (L/100km). Hoy `vehicles` no tiene este campo.

Opciones:

**A) Hacer el campo obligatorio al dar de alta vehículo**
Break de flujo existente. Todos los vehículos ya registrados quedarían inválidos.

**B) Opcional, con fallback a un default global único**
Ej: 30 L/100km para todos los vehículos sin dato. Simple pero impreciso.

**C) Opcional con fallback por equipment_type**
Si el vehicle no tiene dato, usar un default típico según el tipo de equipo (BITREN, SEMI, etc.).

## Decisión

**Opción C** — chain de fallback:

1. Si `vehicle.fuel_consumption IS NOT NULL` → usar ese
2. Si no, usar `pricing_parameters['fuel_consumption_default_{equipment_type}']`
3. Si no existe ese default, usar constante global `30 L/100km` + log warning

## Rationale

### Contra (A)
- **Migration nightmare**: hay ~500 vehículos registrados; ninguno tiene el dato
- **UX inmediata**: el chofer al abrir la app recibiría un popup "complete su vehículo" que rompe el onboarding

### Contra (B)
- **Impreciso**: un BITREN (45 L/100km) y una CAMIONETA (14) tienen 3x de diferencia
- Ajustes con grosso error de base
- Chofer BITREN se sentiría estafado si le aplicaran default de 30

### A favor de (C)
- **No requiere migration de datos**: los vehículos existentes siguen funcionando
- **Precisión razonable**: los defaults por tipo están a ~20% del real (aceptable para V1)
- **Path to precision**: el chofer puede actualizar su vehículo para tener ajustes más exactos
- **Observable**: log warning cuando se usa fallback → podemos medir % de vehículos sin dato

## Consecuencias

**Positivas:**
- Rollout suave
- Incentivo implícito: el chofer que carga su consumo tiene tarifa más justa
- Monitoreable: metric `fuel_consumption_source{source=vehicle|equipment_default|global_default}`

**Negativas:**
- Los ajustes iniciales son aproximados
- Posibilidad de disputa: "no, mi camión consume menos, yo cargaría X"
  - Mitigación: el chofer puede actualizar su vehículo con aprobación admin si el cambio es grande (ver ADR-007)

## Defaults por equipment type

Relevamiento con referentes CATAC + manuales de fabricante. Conservadores (tirando a consumir más, para favorecer al chofer en los ajustes):

| equipment_type | L/100km |
|---|---|
| BITREN | 45 |
| SEMI_REMOLQUE | 35 |
| BATEA | 32 |
| TOLVA | 32 |
| ESCALABLE | 30 |
| CARROZADO | 28 |
| CAMION (sin acoplado) | 28 |
| PLAYO | 26 |
| BARANDA_FIJA | 24 |
| BARANDA_REBATIBLE | 24 |
| CISTERNA | 40 |
| FURGON | 18 |
| CAMIONETA | 14 |
| AUTO | 8 |
| MOTO | 4 |

Se almacenan en `pricing_parameters` con key `fuel_consumption_default_{equipment_type}`.

## Anti-fraude: cambios significativos requieren aprobación

Si un chofer actualiza su consumo con `|delta_pct| > 20%`, el vehículo pasa a `approvalStatus=PENDING_REVIEW`.

```
vehicle.fuel_consumption = 35 → 55 (delta 57%)
→ requiere aprobación admin
```

Admin ve el histórico y puede aceptar/rechazar. Evita que el chofer ponga 100 L/100km para maximizar ajustes.

## Implementación

Ver `VehicleConsumptionService.resolve(vehicle)` en [DESIGN.md §2.2].

Persistir el valor resuelto en `trip_fuel_snapshot.vehicle_fuel_consumption` + el `source` en `config_snapshot.consumption_source` para auditoría.

## Alternativas rechazadas

**Requerir el dato** (A): imposible sin migration masiva.

**Default único** (B): impreciso.

**ML/datos reales del viaje**: overkill. Medir consumo real requiere sensores OBD-II o data de GPS muy precisa. V3 potencial.

## Relacionado

- ADR-001 (modelo de cálculo)
- POLICIES §5 y §6
