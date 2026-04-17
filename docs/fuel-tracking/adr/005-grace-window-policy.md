# ADR-005: Grace window de 30 min post-ASSIGNED

**Status:** Accepted
**Date:** 2026-04-17

## Contexto

Cuando un chofer acepta un trip, se crea el `TripFuelSnapshot` con el precio actual. ¿Qué pasa si el precio cambia 2 minutos después?

Opciones:

**A) Aplicar cualquier cambio desde el minuto 0**
Cualquier cambio post-ASSIGNED genera ajuste.

**B) Grace window: ignorar cambios dentro de los primeros N minutos**

**C) No aplicar ajustes hasta que el trip pase a IN_TRANSIT**

## Decisión

**Opción B** — grace window de 30 minutos post `accepted_at`. Parametrizable.

## Rationale

### Contra (A)
- **Oportunismo bidireccional**: si el precio sube en los siguientes 2 min, el dador sospecha que el chofer "supo" del cambio y lo esperó
- **UX mala**: notificación de ajuste minutos después de aceptar
- **Ambigüedad**: si tomaste snapshot a las 14:30:00 y el precio cambia a las 14:30:05, ¿cuenta?

### Contra (C)
- **Latencia grande**: cargar en origen puede tomar 1-3h. Durante ese tiempo, el precio puede cambiar varias veces y NO contarían.
- **Estado dudoso**: un trip ASSIGNED por 4h antes de IN_TRANSIT no representa "sin costo combustible"; el chofer va al origen, consume combustible.

### A favor de (B) con 30 min
- **Protección mutua**: ambos saben que los primeros 30 min son "blindados"
- **Cargado típico en origen**: cargar en puerto o campo toma 30-60 min. En ese período, el precio fija snapshot.
- **Ajustable**: si aparecen disputas, bajamos a 15 o subimos a 45 sin código nuevo

## Consecuencias

**Positivas:**
- Cubre el lapso de cargado sin ajustes
- Protege contra market-timing de ambas partes
- Transparencia: "tu precio se fijó a las X, se ajustará después de las X+30"

**Negativas:**
- Un cambio grande en los primeros 30 min "se pierde"
- En un viaje corto (<50km) la ventana es significativa % del viaje total
  - Mitigado: viajes <50km nacen `pricing_mode=FIXED` (ver ADR-004 / POLICIES §4)

## Implementación

```python
def should_skip_grace_window(trip, grace_minutes=30):
    if not trip.accepted_at:
        return True  # aún no aceptado, skip
    elapsed = now() - trip.accepted_at
    return elapsed < timedelta(minutes=grace_minutes)
```

En el worker, antes de crear adjustment:

```
if should_skip_grace_window(trip):
    log.info("skip_grace_window", tripId=trip.id, elapsed_min=elapsed_minutes)
    continue
```

## Parámetro

| Key | Default |
|---|---|
| `fuel_grace_window_minutes` | 30 |

## Edge cases

**¿Qué pasa si el precio cambia 5 veces en los primeros 30 min?**
Todos esos cambios se ignoran para este trip. Sí se generan eventos en el outbox, pero el worker los descarta para este trip específico.

**¿El snapshot se actualiza al cambiar el precio dentro de la grace?**
NO. El snapshot es inmutable. La "base" sigue siendo el precio al momento del ASSIGNED.

**¿Cambios retroactivos?**
Si un admin registra un precio con `effective_from` en el pasado (antes del accepted_at), ese precio se usa como base para el próximo ajuste en lugar del snapshot original. Esto es un edge case raro; documentar pero no optimizar.

## Alternativas rechazadas

**Grace de 60 min**: demasiado permisivo en viajes cortos.

**Grace de 15 min**: muy corto si el cargado se demora.

**Grace solo si status=ASSIGNED**: no cubre ACCEPTED-pending-IN_TRANSIT.

## Relacionado

- ADR-001 (snapshot model)
- ADR-004 (threshold policy — grace aplica antes de threshold)
