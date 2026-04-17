# Architecture Decision Records — Fuel Tracking

ADRs capturan decisiones importantes de arquitectura, con contexto y consecuencias. Formato Michael Nygard (clásico).

## Status lifecycle

- **Proposed** — en discusión
- **Accepted** — decisión tomada y vigente
- **Deprecated** — ya no aplica, reemplazada por otra
- **Superseded by ADR-XXX** — explícitamente reemplazada

## Lista

| # | Título | Status |
|---|---|---|
| [001](./001-hybrid-snapshot-model.md) | Modelo híbrido con snapshots + ajustes proporcionales | Accepted |
| [002](./002-event-sourcing-price-history.md) | Event sourcing append-only para `fuel_price_history` | Accepted |
| [003](./003-transactional-outbox-pattern.md) | Transactional outbox + BullMQ para propagación async | Accepted |
| [004](./004-threshold-based-auto-apply.md) | Política escalonada threshold-based de auto-apply | Accepted |
| [005](./005-grace-window-policy.md) | Grace window de 30 min post-ASSIGNED | Accepted |
| [006](./006-symmetric-adjustment.md) | Ajuste simétrico (sube y baja) | Accepted |
| [007](./007-vehicle-consumption-fallback.md) | Consumo por vehículo con fallback por equipment type | Accepted |
| [008](./008-manual-source-extensible.md) | Fuente manual V1, schema extensible a APIs V2 | Accepted |
| [009](./009-distributed-lock-redis.md) | Distributed lock Redis por tripId | Accepted |
| [010](./010-feature-flags-rollout.md) | Feature flags para rollout gradual | Accepted |
| [011](./011-gps-history-table.md) | GPS history table para prorrateo preciso | Accepted |
| [012](./012-legal-compliance.md) | Compliance legal — declaración + notificación con PDF | Accepted |

## Cuándo crear un nuevo ADR

- Cambio de schema con impacto multi-módulo
- Cambio de política que afecta al usuario final
- Elección de librería/pattern con tradeoffs
- Decisión de no hacer algo (ADR-Negative)

## Cómo modificar un ADR existente

NO se edita el contenido. Se crea un nuevo ADR con `Superseded by ADR-XXX` y se marca el viejo como `Deprecated`.
