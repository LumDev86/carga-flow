# ADR-011: GPS history table para prorrateo preciso

**Status:** Accepted
**Date:** 2026-04-17

## Contexto

Para calcular `km_remaining` preciso al momento del ajuste, necesitamos saber cuántos km se recorrieron. Hoy, `users.latitude/longitude` guarda solo la posición actual, sin histórico.

Opciones:

**A) Mantener solo posición actual + estimación lineal**
`km_traveled ≈ haversine(origin, current_position)`.

**B) Estimación temporal**
`km_traveled ≈ (now - accepted_at) / estimated_duration × total_km`.

**C) Tabla de histórico GPS**
Registrar cada punto GPS con `recorded_at`. Integrar Haversine sobre el tracklog.

**D) PostGIS + geometría de ruta**
Snap GPS points a una polyline pre-calculada y medir progreso sobre ella.

## Decisión

**Opción C** — tabla `trip_location_history` simple, integración Haversine.

Con **fallback a (A)** si no hay puntos.

## Rationale

### Contra (A)
- **Impreciso en rutas con curvas**: línea recta origen→actual subestima camino recorrido (factor ~1.3x en Argentina)
- **No ve desvíos** (chofer toma atajo o se pierde)
- **Suficiente para una gross estimation** pero no para $ real

### Contra (B)
- **Asume ETA correcto**: si el chofer va más rápido/lento, se rompe
- **Estimar por tiempo es oportunidad de fraude**: chofer puede "cronometrar" cambios de precio

### Contra (D)
- **Complejidad**: PostGIS agrega dependency, aprendizaje
- **No tenemos ruta exacta pre-calculada**: Google Directions devuelve polyline, tendríamos que persistirla
- **V2**: si V1 con (C) tiene problemas reales, evaluamos migrar

### A favor de (C)
- **Precisión razonable**: 500 puntos en un viaje de 6h = 1 cada 43s, error < 2% en km acumulado
- **Simple**: tabla con insert batch, query con LAG() o loop
- **Compatible con modelo actual**: no altera nada; solo agrega histórico
- **Reutilizable**: pronto vamos a querer tracking en vivo detallado (para dador ver GPS del chofer en mapa)

## Implementación

### Schema

```sql
CREATE TABLE trip_location_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  speed_kmh DECIMAL(6,2),
  accuracy_m DECIMAL(8,2),
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trip_location_trip_time
ON trip_location_history (trip_id, recorded_at);
```

Sin PostGIS. Usar DECIMAL.

### Batch upload desde mobile

El mobile acumula puntos cada 30s y envía cada 2 min o al llegar a 20 puntos. Endpoint `POST /trips/:id/location` batched.

### Cálculo de km recorridos

```typescript
async function calcKmTraveled(tripId: string): Promise<number> {
  const points = await this.repo.find({
    where: { tripId },
    order: { recordedAt: 'ASC' },
  });

  if (points.length < 2) {
    return estimateFromCurrentPosition(trip); // fallback (A)
  }

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversine(points[i - 1], points[i]);
  }
  return total;
}
```

Factor 1.0 sobre el tracklog (no aplicar 1.3 porque ya está en puntos reales).

### Filtrar puntos imprecisos

Ignorar puntos con:
- `accuracy_m > 100` (mala señal)
- `speed_kmh > 140` (físicamente improbable para camión)
- Delta temporal al punto anterior > 5 min Y distancia > 10 km (salto teletransportado = error)

### Retention

90 días. Cron diario:
```sql
DELETE FROM trip_location_history
WHERE recorded_at < NOW() - INTERVAL '90 days';
```

Compliance LGPD / Ley 25.326 (datos personales de geolocalización).

## Consecuencias

**Positivas:**
- Cálculo de km preciso para ajustes
- Feature subsidaria: visualización de ruta real del chofer (mobile dador)
- Debugging: "¿por qué se aplicó X ajuste?" podemos reconstruir

**Negativas:**
- **Volumen de datos**: ~500 puntos × 30 viajes/día × 90 días = ~1.3M rows
  - Cada row ~150 bytes = ~200MB. Manejable con partitioning por mes si escala más
- **Privacidad**: ubicación de choferes = dato sensible
  - Mitigación: retention 90 días, no exponer a usuarios finales del lado del dador (solo agregado visual)
- **Mobile battery**: GPS cada 30s impacta batería
  - Mitigación: el chofer ya tiene el GPS activo durante el viaje; solo agregamos batching

## Alternativas futuras

**V2: PostGIS** si:
- El error en km > 5% en muestra
- Necesitamos snap a ruta oficial
- Queremos geofencing preciso

**V2: Migrar a time-series DB** (TimescaleDB) si volumen >10M rows.

## Relacionado

- ADR-001 (modelo híbrido depende de km preciso)
- Módulo `geolocation` existente
