# Fuel Tracking — Real-Time Gasoil Pricing

> **Status:** Design Phase (FASE 0)
> **Owner:** Backend + Mobile + CRM teams
> **Author:** CargaFlow Engineering
> **Last updated:** 2026-04-17

## Resumen ejecutivo

Sistema de trackeo en tiempo real del precio del gasoil que ajusta proporcionalmente el costo de los viajes en curso cuando el precio varía durante la ejecución. Es una feature crítica para la equidad económica de la plataforma: fletes largos (grano, interprovincial) están expuestos a variaciones de combustible que pueden superar el margen comercial del chofer.

## Problema que resuelve

Un viaje Concepción del Uruguay → Buenos Aires dura 6-10 horas. Si el gasoil sube $20/L a la mitad del viaje, hoy el chofer absorbe la diferencia (pierde plata) o el dador se beneficia a su costa. Al revés: si el gasoil baja, el dador paga de más. Ambos casos son inequitativos y generan disputas que afectan la confianza en la plataforma.

## Solución propuesta

Modelo híbrido con **snapshots inmutables** al arrancar el viaje y **ajustes proporcionales al km restante** cuando el precio cambia. Política escalonada según la magnitud del cambio, con ventanas de gracia y feature flags para rollout controlado.

## Documentos

| Doc | Propósito |
|---|---|
| [DESIGN.md](./DESIGN.md) | Design doc principal — arquitectura, componentes, flows |
| [ERD.md](./ERD.md) | Entity-Relationship Diagram — schema nuevo + alteraciones |
| [SEQUENCES.md](./SEQUENCES.md) | Sequence diagrams para flows críticos |
| [API.md](./API.md) | Contratos REST + WebSocket + eventos |
| [POLICIES.md](./POLICIES.md) | Políticas de negocio — thresholds, ventanas, auto-apply |
| [ROLLOUT.md](./ROLLOUT.md) | Plan de rollout gradual + feature flags + rollback |
| [adr/](./adr/) | Architecture Decision Records — 12 decisiones fundamentadas |

## ADRs

| # | Decisión | Status |
|---|---|---|
| 001 | Modelo híbrido con snapshots + ajustes proporcionales | Accepted |
| 002 | Event sourcing append-only para precio histórico | Accepted |
| 003 | Transactional outbox pattern + BullMQ async worker | Accepted |
| 004 | Política escalonada threshold-based de auto-apply | Accepted |
| 005 | Grace window de 30 min post-ASSIGNED | Accepted |
| 006 | Ajuste simétrico (sube y baja) | Accepted |
| 007 | Consumo por vehículo con fallback por equipment type | Accepted |
| 008 | Fuente manual (V1) con schema extensible a APIs externas (V2) | Accepted |
| 009 | Distributed lock Redis por tripId | Accepted |
| 010 | Feature flags para rollout gradual | Accepted |
| 011 | GPS history table para prorrateo preciso | Accepted |
| 012 | Compliance legal — declaración del dador + notificación con PDF | Accepted |

## Milestones

- **M0 — Diseño aprobado** (este doc + ADRs merged) ← estamos acá
- **M1 — Backend completo + tests** (fases 1.1 a 1.7 + fase 2)
- **M2 — Deploy con feature flags OFF** (fase 3)
- **M3 — CRM admin UI** (fase 4.1)
- **M4 — Mobile + Portal** (fases 4.2, 4.3)
- **M5 — Rollout 10% dadores** (48h monitoreo)
- **M6 — Rollout 50%** (48h monitoreo)
- **M7 — Rollout 100%** (GA)
- **M8 — Declaración actualizada + legal review** (fase 5)

## No-goals (fuera de alcance V1)

- Integración automática con APIs de YPF / Enargas / Surtidor (queda para V2, schema lo soporta)
- Precios por zona geográfica (hoy un solo precio nacional por tipo de combustible)
- Renegociación de tarifa a petición del chofer (solo el admin registra cambios)
- Predicción / forecast de precio
- Hedging / swaps financieros
