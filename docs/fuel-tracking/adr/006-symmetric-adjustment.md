# ADR-006: Ajuste simétrico (sube y baja)

**Status:** Accepted
**Date:** 2026-04-17

## Contexto

Si el gasoil sube durante un viaje, generamos ajuste positivo (dador paga más). ¿Qué pasa si baja?

**A) Asimétrico (solo sube)**
Solo ajustes positivos. Bajadas no afectan la tarifa.

**B) Simétrico (sube y baja)**
Tanto subidas como bajadas generan ajustes (positivo / negativo).

**C) Asimétrico (solo baja)**
Improbable, pero completeness.

## Decisión

**Opción B** — simétrico.

## Rationale

### Contra (A)
- **Inequidad**: el chofer absorbe riesgo de suba, pero el dador no recibe beneficio de baja. Favor unilateral.
- **Oportunismo del chofer**: si puede "elegir" cuándo iniciar el viaje, iniciaría cuando está alto
- **Contratos CATAC**: el ajuste CATAC es bidireccional por norma
- **Imagen de marca**: se percibe como "impuesto oculto que solo puede subir"

### Contra (C)
- No tiene sentido económico ni legal. Rechazado.

### A favor de (B)
- **Justicia económica**: el riesgo y el beneficio se comparten según ocurran los eventos
- **Alineado con Fe.Tr.A**: la fórmula oficial es simétrica
- **Simpler mental model**: "el tramo que falta se cobra al precio vigente al momento del cambio"
- **Compliance**: evita disputas de "cláusulas abusivas" (Ley 24.240)

## Consecuencias

**Positivas:**
- El sistema es intrínsecamente justo
- El código es más simple (no hay `if new_price > old_price`)
- Genera confianza bidireccional

**Negativas:**
- Complica UX: bajadas también generan notificaciones (aunque sean "buenas noticias")
  - Mitigación: bajadas INFORMATIVE pueden tener copy distinto ("¡Tu envío se abarató $X!")
- Chofer puede rechazar una bajada → complica accounting (queda congelado el precio anterior para ese chofer)

## Implementación

El `adjustment_amount` puede ser negativo. Column `DECIMAL(10,2)` permite signo. `CHECK` constraint solo valida sanity extremos (no permitir `< -1M`).

```typescript
const adjustment_amount = liters_remaining * (new_price - old_price);
// Puede ser positivo (subida) o negativo (bajada)
```

El `pct_change` también puede ser negativo:

```
pct_change = (new_price - old_price) / old_price
```

### UX diferenciada (mobile)

- **Subida (adjustment > 0)**: icono alerta, tono informativo, explicación "el tramo restante se ajustó porque el gasoil subió"
- **Bajada (adjustment < 0)**: icono celebración, tono positivo, "ahorraste $X porque el gasoil bajó"

Ambos con mismo flujo técnico; solo cambia copy.

### Liquidación

`Trip.actual_final_amount = Trip.price + Trip.total_fuel_adjustment`

Si `total_fuel_adjustment < 0`, `actual_final_amount < price` (dador paga menos).

Al acreditar al chofer:
```
driver_payout = actual_final_amount - commission
```

Si `actual_final_amount` es menor, driver_payout es menor. Es coherente económicamente (el precio total se abarató).

## Edge case: rechazo de bajada

Escenario raro pero posible: el chofer rechaza una bajada (no quiere cobrar menos).

**Política:** aceptamos el rechazo, el ajuste queda REJECTED, `total_fuel_adjustment` no cambia. El dador paga el precio original.

**Legalidad:** el chofer puede renunciar a un beneficio propio.

## Alternativas rechazadas

**A (solo sube)**: unilateral, inequitativo.

**C (solo baja)**: absurdo.

**Ajuste asimétrico con tope**: "sube 100%, baja solo 50%"
- Rechazado: arbitrario, genera disputas sobre el tope.

## Relacionado

- ADR-001 (modelo híbrido)
- ADR-004 (threshold policy aplica igual a subidas que bajadas)
