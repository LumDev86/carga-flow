# ADR-002: Event sourcing append-only para `fuel_price_history`

**Status:** Accepted
**Date:** 2026-04-17

## Contexto

El precio del gasoil necesita ser auditable en el tiempo. Para cualquier disputa futura sobre un viaje del pasado, debemos poder responder: "¿cuál era el precio a las 14:32 del 15 de abril?"

Opciones:

**A) Row single updatable**
Una sola fila `current_price` que se UPDATEa.

**B) History append-only**
Insertar un row por cada cambio, nunca UPDATE ni DELETE.

**C) Event sourcing completo (CQRS con read models)**
Eventos, aggregates, proyecciones separadas.

## Decisión

**Opción B** — append-only history con lectura "current = LIMIT 1 ORDER BY effective_from DESC".

## Rationale

- **Compliance legal**: Ley 25.326 (Protección de Datos) + AFIP requieren trazabilidad fiscal por 10 años
- **Disputas**: un chofer puede reclamar 6 meses después "¿por qué me cobraron X?"; necesitamos reconstruir
- **Simplicidad vs C**: no necesitamos la sobreingeniería de CQRS completo para esto; una tabla append-only con índice adecuado resuelve
- **Costo bajo**: ~100 rows/año × 10 años = 1000 rows. Nada.

## Consecuencias

**Positivas:**
- Auditoría forense exacta: `SELECT * FROM fuel_price_history WHERE effective_from <= :t ORDER BY effective_from DESC LIMIT 1`
- Rollbacks son append (insertar nuevo row con `source=SYSTEM_ROLLBACK`), no mutación
- Índice BRIN en `effective_from` = storage mínimo, lookups rápidos en series temporales
- No requiere triggers ni soft-delete

**Negativas:**
- Dev debe resistir la tentación de UPDATE (agregar trigger que bloquee)
- La lectura "precio actual" requiere query con ORDER BY + LIMIT 1, no es un punto directo
  - Mitigado con cache Redis (TTL 30s)

## Consideraciones técnicas

### Bloqueo de UPDATE/DELETE (opcional)

```sql
CREATE OR REPLACE FUNCTION prevent_fuel_price_mutations()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'fuel_price_history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_fuel_price
BEFORE UPDATE OR DELETE ON fuel_price_history
FOR EACH ROW EXECUTE FUNCTION prevent_fuel_price_mutations();
```

Evaluar si activarlo en prod (útil pero requiere override para migraciones futuras).

### Reconstruir precio a timestamp arbitrario

```sql
SELECT price_per_liter
FROM fuel_price_history
WHERE fuel_type = $1
  AND effective_from <= $2
ORDER BY effective_from DESC
LIMIT 1;
```

Con BRIN index + compound (fuel_type, effective_from DESC) → O(log N) con costo mínimo.

### Idempotencia

`idempotency_key` UNIQUE permite reintentos del cliente sin duplicar entries. Si un cliente hace doble-submit, la segunda request devuelve el row existente.

## Alternativas rechazadas

**A — single updatable**: pierde histórico, imposible reconstruir.

**C — CQRS completo**: overkill. Nuestra escala (100 rows/año) no justifica proyecciones separadas.

## Relacionado

- ADR-003 (outbox para propagación)
- ADR-012 (compliance legal)
