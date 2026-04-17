# ADR-001: Modelo híbrido con snapshots y ajustes proporcionales al km restante

**Status:** Accepted
**Date:** 2026-04-17

## Contexto

El precio del gasoil varía durante un viaje que puede durar 6-10h. Tenemos que decidir cómo reflejar ese cambio en la tarifa final.

Opciones evaluadas:

**A) Snapshot al inicio + ajuste al final (promedio)**
Calcular el precio promedio entre inicio y fin, aplicar diferencia total. Simple.

**B) Integración por tramos con GPS real**
Para cada tramo recorrido (intervalo de 10 min), calcular el costo con el precio vigente en ese intervalo. Muy preciso, muy complejo.

**C) Híbrido: snapshot al inicio + ajuste proporcional a km restantes en cada cambio**
Cuando cambia el precio, calcular cuántos km faltan por recorrer y ajustar solo ese tramo pendiente con la diferencia del precio.

## Decisión

Adoptar **opción C**.

## Consecuencias

**Positivas:**
- Alinea con cómo CATAC y Fe.Tr.A manejan ajustes (por km restante, no por tiempo)
- Simple de explicar a los usuarios: "el tramo que falta se ajusta al nuevo precio"
- Previene fraude: el chofer no puede "demorarse" para beneficiarse de un alza
- Cada cambio de precio genera un ajuste independiente, auditable
- No requiere reconstrucción histórica compleja

**Negativas / tradeoffs:**
- Menos preciso que opción B en viajes con múltiples cambios
- Sensible a la precisión del GPS (si hay huecos, km_recorridos es estimado)
- Requiere tabla de ubicaciones históricas (ver ADR-011)

**Mitigaciones:**
- GPS history con batching cada 30s-2min (ver §7 de SEQUENCES.md)
- Fallback lineal si hay gap GPS > 2h
- Log estructurado cuando se usa fallback

## Alternativas rechazadas

**Opción A (promedio):**
- Injusto cuando hay un salto grande mid-viaje: el precio promedio diluye el impacto real del tramo pendiente.
- Ejemplo: precio sube 20% al 10% del viaje → promedio = 19%, pero el 90% del viaje se hace al precio nuevo.

**Opción B (integración por tramos):**
- Complejidad de implementación alta: requiere snapshot de precio cada N minutos por viaje.
- Storage: 10x el volumen.
- El beneficio de precisión no justifica el costo operativo para V1.
- Puede evaluarse V2 si aparecen disputas específicas.

## Referencias

- [DESIGN.md §3.2](../DESIGN.md)
- Fe.Tr.A Fórmula de ajuste combustible (documento interno)
- CATAC Res. 2024-XX (ajustes tarifarios)
