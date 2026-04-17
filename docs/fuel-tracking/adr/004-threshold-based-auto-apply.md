# ADR-004: Política escalonada threshold-based de auto-apply

**Status:** Accepted
**Date:** 2026-04-17

## Contexto

Cuando el gasoil cambia, hay que decidir qué pasa con viajes activos. Dos extremos:

**A) Todo es PROPOSED (requiere aprobación)**
Cada cambio genera modal bloqueante al dador.

**B) Todo AUTO_APPLIED (sin intervención)**
Los ajustes se aplican silenciosamente.

Opción C: política escalonada según magnitud del cambio.

## Decisión

**Opción C**, con 3 niveles:

| Δ% cambio | Política | UX |
|---|---|---|
| ≤ 3% | `SILENT` | AUTO_APPLIED sin notificar |
| 3% < Δ ≤ 10% | `INFORMATIVE` | AUTO_APPLIED con push + ventana 24h para revertir |
| > 10% | `EXPLICIT` | PROPOSED, requiere accept/reject |

Todos los thresholds parametrizados en `pricing_parameters`, no hardcoded.

## Rationale

### Contra (A): "Todo requiere aprobación"

- **Fatiga de notificaciones**: el gasoil varía típicamente 0.5-2% semanal. 10 notifications/día × 500 dadores = spam.
- **Bloqueo del viaje**: si el dador no responde en tiempo, ¿se aplica? ¿se rechaza? Requiere política que genera complejidad igual.
- **UX mala**: "No puedo enviar mi envío hasta que acepte un ajuste de $50"

### Contra (B): "Todo silencioso"

- **Cambios grandes sin consentimiento**: si el gasoil sube 20% mid-viaje y el dador ve una factura con $50k extras, se va de la plataforma
- **Compliance legal**: Argentina tiene jurisprudencia de "cláusulas sorpresa" consideradas abusivas

### A favor de (C): "Política escalonada"

- **Balance real**: ruido (≤3%) = silencioso; variación moderada (3-10%) = informativo; eventos macro (>10%) = consentimiento
- **Reversibilidad**: la ventana de 24h en INFORMATIVE da opción sin bloquear
- **Calibrable con datos**: los thresholds son editables; A/B testeable

## Consecuencias

**Positivas:**
- Notificaciones tienen relevancia proporcional al impacto
- Trips cortos raramente van a EXPLICIT (poco km restante = poco dinero)
- Auditoría clara: cada adjustment sabe qué policy aplicó

**Negativas:**
- Más lógica de UI: la mobile debe manejar 3 caminos diferentes
- Definir "qué es cambio grande" requiere datos (iniciamos con defaults)

## Detalles

### Cálculo del Δ%

```
pct_change = (new_price - old_price) / old_price
```

NO absoluto. Subir de $100 a $103 y subir de $3000 a $3030 son el mismo 3% relativo.

### Umbral SILENT = 3%

Según relevamiento de 2 años de precio gasoil AR:
- 78% de cambios entre actualizaciones son <3%
- Esos son "ruido" de mercado normal

### Umbral EXPLICIT = 10%

Eventos >10% son:
- Saltos de cotización USD
- Aumentos dispuestos por autoridad (Sec. Energía)
- Suspensiones de subsidio

Son decisiones macro que el dador debe conocer y aceptar.

### Ventana INFORMATIVE = 24h

Tiempo típico de un viaje AR largo + buffer para que el dador revise. Ajustable.

## Alternativas rechazadas

**2-niveles (silencioso vs explícito)**: menos granular, perdemos el caso "medio" que necesita notificar sin bloquear.

**Absoluto ($ fijo)**: mal modela, no escala con la inflación del flete.

## Parámetros finales

| Key | Default |
|---|---|
| `fuel_threshold_silent_pct` | 0.03 |
| `fuel_threshold_explicit_pct` | 0.10 |
| `fuel_auto_apply_deadline_hours` | 24 |

## Relacionado

- ADR-005 (grace window)
- ADR-006 (simetría)
- ADR-010 (feature flags — puede degradar a "todo EXPLICIT")
