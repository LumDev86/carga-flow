# ADR-009: Distributed lock Redis por `tripId` en recalculaciones

**Status:** Accepted
**Date:** 2026-04-17

## Contexto

El worker recalcula múltiples trips en paralelo. Qué pasa si:

1. Dos workers toman el mismo evento (por bug o race)
2. El admin hace doble-click y genera 2 eventos cercanos
3. Se escala horizontalmente y hay 3 workers procesando

Sin protección → DOBLE adjustment para el mismo trip + misma razón. Grave (dinero).

Opciones:

**A) Lock en DB con `SELECT FOR UPDATE`**
Lock pesimistic sobre `trips.id`.

**B) UNIQUE constraint en `trip_fuel_adjustments`**
Evitar doble insert con constraint `(trip_id, triggering_price_history_id)`.

**C) Distributed lock Redis**
Lock con TTL sobre `fuel:recalc:trip:{tripId}`.

**D) Combinación de B + C**
Defense in depth.

## Decisión

**Opción D** — lock Redis como protección primaria, UNIQUE constraint como protección secundaria.

## Rationale

### Problemas de (A) solo
- Lock DB con alta concurrencia ralentiza queries
- Un lock DB no previene que el lógica de cálculo se ejecute 2 veces (solo protege el INSERT final)
- Deadlocks posibles si combinamos con los locks existentes de liquidación

### Problemas de (B) solo
- El constraint evita DB duplicate, pero la lógica de cálculo corrió 2 veces (desperdicio CPU)
- No evita side effects como "enviar push 2 veces"
- Manejo de error: hay que detectar ON CONFLICT y saber que NO fue un error real

### Por qué (C) sola no es suficiente
- TTL de lock puede expirar antes de completar operación lenta
- Si Redis tiene hiccup, el lock no se toma → doble processing

### Por qué (D): defense in depth
- **Redis lock** previene 99% de casos: dos workers no se pisan
- **UNIQUE constraint** es la red de seguridad: si algo rarísimo se escapa, DB lo atrapa
- Performance: la mayoría del tiempo el lock Redis ahorra el processing duplicado; el constraint rara vez se dispara

## Implementación

### Redis lock (Redlock pattern simple con TTL)

```typescript
async acquireLock(tripId: string, ttlMs = 10000): Promise<boolean> {
  const key = `fuel:recalc:trip:${tripId}`;
  const result = await redis.set(key, '1', 'PX', ttlMs, 'NX');
  return result === 'OK';
}

async releaseLock(tripId: string): Promise<void> {
  await redis.del(`fuel:recalc:trip:${tripId}`);
}
```

TTL 10s = suficiente margen para el recalc típico (<500ms) + margen de retry.

### Worker flow

```typescript
if (!(await acquireLock(tripId))) {
  log.info('skip_locked', tripId);
  return; // otro worker lo está procesando; se re-intentará en el próximo poll
}
try {
  await recalculateTrip(tripId, priceChange);
} finally {
  await releaseLock(tripId);
}
```

### UNIQUE constraint (DB safety net)

```sql
ALTER TABLE trip_fuel_adjustments
ADD CONSTRAINT uq_trip_adjustments_per_price
UNIQUE (trip_id, triggering_price_history_id);
```

Si un escape lógico intenta insertar dos adjustments para el mismo trip+price, DB lanza error. El worker captura el error `23505` y lo convierte en skip silencioso (idempotencia).

```typescript
try {
  await repo.insert(adjustment);
} catch (err) {
  if (err.code === '23505') {
    log.warn('duplicate_adjustment_caught_by_constraint', { tripId, priceId });
    return; // no es error real
  }
  throw err;
}
```

## Consecuencias

**Positivas:**
- Seguridad en escenarios multi-worker, multi-pod
- DB constraint documenta la invariante en el schema (autoexplicativo)
- Observable: métricas de "locks skipped" y "constraint catches"

**Negativas:**
- Dos sistemas a mantener (Redis + DB constraint)
- Ligera complejidad extra en el código

## Edge case: lock no se libera (crash)

Si el worker crashea mid-processing:
- El lock Redis se libera automáticamente por TTL (10s)
- El próximo intento (2s después) recogerá el outbox PENDING
- Constraint protege contra doble-insert

**Tradeoff**: hasta 10s de delay en re-processing de trips fallidos. Aceptable.

## Alternativas rechazadas

**Solo A (DB lock)**: performance issue, no previene doble-ejecución lógica.

**Solo B (constraint)**: side effects duplicados (push 2x).

**Solo C (Redis lock)**: sin red de seguridad.

**Kafka + partitioning por tripId**: overkill.

## Observabilidad

Métricas:
- `fuel_recalc_locks_acquired_total`
- `fuel_recalc_locks_skipped_total`
- `fuel_recalc_constraint_violations_total` (debería ser 0 o casi)

## Relacionado

- ADR-003 (outbox)
- Patrón usado ya: `confirmFleteReceived` (lock pessimistic) para liquidación
