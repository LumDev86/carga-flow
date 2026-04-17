# ADR-003: Transactional outbox pattern + BullMQ para propagación async

**Status:** Accepted
**Date:** 2026-04-17

## Contexto

Cuando el admin registra un cambio de precio, hay que:
1. Persistir el cambio en `fuel_price_history`
2. Notificar al worker para que recalcule viajes activos

Opciones:

**A) Endpoint síncrono: registrar + recalcular en la misma request**
POST responde después de actualizar todos los viajes afectados.

**B) Event emitter directo en memoria (NestJS EventEmitter)**
Emitir evento en proceso, listeners escuchan, workers procesan.

**C) Outbox pattern**
Escribir cambio Y evento "pendiente" en la misma transacción DB. Worker polls el outbox y dispatcha.

## Decisión

**Opción C** — Transactional outbox con tabla `integration_outbox` + BullMQ worker.

## Rationale

### Problemas de (A)
- Latencia: un cambio de precio con 500 viajes activos puede tardar minutos
- Timeout HTTP (30s default) hace que admin vea "error" aunque haya funcionado
- Si falla a la mitad, no sabemos qué trips fueron procesados → inconsistencia

### Problemas de (B)
- Dual-write problem: si el DB commit tiene éxito pero el emit falla (crash, GC pause), perdemos el evento
- No persistente: restart del pod pierde eventos en vuelo
- No hay retry ni DLQ sin código extra

### Beneficios de (C)
- **Atomicidad**: cambio + evento se commitean en la misma TX, o ambos fallan
- **Durabilidad**: si el worker cae, el outbox permanece en DB
- **Exactly-once delivery**: con `FOR UPDATE SKIP LOCKED` en el polling
- **Retry automático**: BullMQ maneja backoff exponencial + DLQ
- **Latencia admin**: endpoint responde en <100ms (solo insert en DB)
- **Escalable**: múltiples pollers en cluster sin double-processing

## Consecuencias

**Positivas:**
- Admin ve respuesta instantánea
- Propagación eventual pero garantizada
- Observable: podemos consultar `SELECT COUNT(*) FROM integration_outbox WHERE status='PENDING'` = health metric

**Negativas:**
- Latencia extra: ~2-5s entre cambio y primer recalculo (polling interval)
- Más tablas y módulos
- Dev debe entender el pattern

**Mitigaciones:**
- Polling cada 2s (compromiso aceptable)
- Métrica de tiempo "outbox_lag" para alertar si sube
- Documentar el pattern en README del módulo

## Detalles de implementación

### Polling

```sql
BEGIN;
SELECT * FROM integration_outbox
WHERE status='PENDING'
ORDER BY created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 10;

-- Para cada item:
UPDATE integration_outbox SET status='PROCESSING' WHERE id=$1;
COMMIT;

-- Encolar en BullMQ
-- Al completar job:
UPDATE integration_outbox SET status='PROCESSED', processed_at=NOW() WHERE id=$1;
```

### Estructura del evento

```json
{
  "event_type": "fuel.price.changed",
  "aggregate_type": "fuel_price",
  "aggregate_id": "uuid",
  "payload": {
    "priceHistoryId": "uuid",
    "fuelType": "COMUN",
    "oldPrice": 1867.00,
    "newPrice": 1950.00,
    "pctChange": 0.0444,
    "effectiveFrom": "..."
  }
}
```

### Worker

BullMQ Queue: `fuel-price-changes`
Processor: `FuelPriceChangeProcessor`
Concurrency: 5 (procesar varios precios concurrentes no es común, pero permite)
Retry: 3 intentos con backoff 3s/15s/60s
DLQ: `fuel-price-changes-dlq` para manual review

## Alternativas rechazadas

**A (síncrono)**: no escala, mala UX, riesgo de inconsistencia.

**B (event emitter en memoria)**: dual-write problem hace que perdamos eventos en crashes. Inaceptable para sistema financiero.

**Kafka/RabbitMQ**: overkill para el volumen. BullMQ sobre Redis (ya en stack) es suficiente.

## Relacionado

- ADR-002 (append-only history — necesita propagación)
- ADR-009 (distributed lock — evita doble recalc)
- ADR-010 (feature flags — gate del worker)
