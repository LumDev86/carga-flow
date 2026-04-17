# ADR-012: Compliance legal — declaración del dador + notificación con PDF

**Status:** Accepted
**Date:** 2026-04-17

## Contexto

En Argentina, modificar unilateralmente un precio post-contrato puede ser considerado "cláusula abusiva" (Ley 24.240, Defensa del Consumidor; Ley 26.993, relaciones de consumo).

Aunque CargaFlow opera B2B (flete entre empresas / productores), la jurisprudencia reciente extiende protección a pymes en relaciones asimétricas.

Necesitamos:
1. Consentimiento previo explícito del dador a la política de ajuste
2. Notificación fehaciente de cada ajuste aplicado
3. Trazabilidad completa para disputas

## Decisión

Combinar:
- **Cláusula en la Declaración del Dador** con consentimiento en registro
- **Notificación push + email con PDF adjunto** en cada ajuste INFORMATIVE o EXPLICIT
- **Audit trail completo** en la DB (ya provisto por el schema)

## Rationale

### Contra "implícito" (no hacer nada)
- Riesgo legal elevado
- Disputas que ya tenemos de 2025 muestran que los dadores se quejan por ajustes no avisados
- Mala imagen

### Contra "solo declaración"
- Juez puede considerar "genérica", no suficiente aviso
- Sin notificación fehaciente del ajuste concreto, no hay proof que el dador supo

### Contra "solo notificación"
- Sin consentimiento previo, cada notificación podría ser impugnada
- Muchos dadores no leerían (fatiga de notis)

### A favor (combinación)
- Defensa en profundidad legal: consentimiento explícito + aviso específico + audit trail
- Práctica estándar en la industria (seguros, servicios con ajuste por inflación)

## Implementación

### 1. Cláusula en Declaración del Dador

Archivo: `carga-flowFront/src/screens/RegisterScreen.tsx` (actualmente líneas 674-702).

Agregar un nuevo punto:

```
7. Ajuste por variación del precio del combustible

El Dador declara conocer y aceptar que los fletes cotizados
contemplan el precio vigente del gasoil al momento de la
solicitud. Si dicho precio varía durante la ejecución del
transporte, CargaFlow podrá aplicar un ajuste proporcional
al trayecto no recorrido, con la siguiente política:

a) Variaciones hasta el 3% se aplican sin notificación por
   considerarse fluctuación normal de mercado.
b) Variaciones del 3% al 10% se aplican con notificación
   previa y ventana de 24hs para solicitar revisión.
c) Variaciones superiores al 10% requieren aprobación expresa
   del Dador antes de aplicarse.

El Dador recibirá documentación de cada ajuste vía aplicación
y correo electrónico, con detalle del cálculo.
```

Checkbox dentro del mismo `declarationCheckRow`. `hasAcceptedDeclaration` ya persiste en `users` table.

### 2. Re-aceptación para users existentes

Los dadores ya registrados (con `hasAcceptedDeclaration=true` sobre la versión anterior) deben re-aceptar antes de que se les aplique fuel tracking.

Dos estrategias:

**A) Campo `declaration_version`**
Agregar columna `declaration_version INT DEFAULT 1`. Versión actual = 2. Si user tiene v1, se le muestra modal de re-aceptación al abrir la app.

**B) Flag separado `hasAcceptedFuelClause`**
Columna dedicada; simpler pero less extensible.

Preferimos **A** (más general, permite versionar otras cláusulas futuras).

Schema:

```sql
ALTER TABLE users
  ADD COLUMN declaration_version INT DEFAULT 1;

-- Para users que aceptaron antes del feature, mantienen v1
-- Nuevos users aceptan v2 directo
```

### 3. Notificación fehaciente

**Push notification** (via Expo):
```
Ajuste aplicado a tu envío #12345
El precio del gasoil varió 5.2%. Ajuste: +$2,450.
Ver detalle en la app.
```

**Email** (via nodemailer ya configurado):

- Subject: "CargaFlow — Ajuste por combustible en tu envío"
- Body: texto con detalle
- PDF adjunto con:
  - Detalle del trip (origen, destino, fecha)
  - Snapshot original (precio, km, consumo)
  - Precio nuevo y fuente
  - Cálculo del ajuste (fórmula + valores)
  - Referencia al cambio en `fuel_price_history` (ID)
  - Política aplicada (SILENT / INFORMATIVE / EXPLICIT)
  - Opción de rechazar (si aplica) con link a la app
  - Firma digital de CargaFlow (hash del contenido)

### 4. Generación del PDF

Librería: **PDFKit** o **puppeteer** (ya puede estar en stack para CPE). Crear template en `templates/fuel-adjustment.hbs` o similar.

El PDF se genera al momento de crear el adjustment AUTO_APPLIED o al responder PROPOSED. Se persiste en Supabase Storage bucket `fuel-adjustments/{tripId}/{adjustmentId}.pdf` para re-enviarse si hay disputa.

### 5. Audit trail

Ya cubierto por el schema (`fuel_price_history`, `trip_fuel_snapshots`, `trip_fuel_adjustments` con `responded_by`, `responded_at`, `rejection_reason`).

Agregar tabla auxiliar `fuel_adjustment_notifications`:

```sql
CREATE TABLE fuel_adjustment_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  adjustment_id UUID NOT NULL REFERENCES trip_fuel_adjustments(id),
  channel VARCHAR(20) NOT NULL, -- 'push', 'email', 'in_app'
  status VARCHAR(20) NOT NULL, -- 'sent', 'delivered', 'read', 'failed'
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  pdf_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Permite responder: "¿cuándo se notificó al dador X del ajuste Y?"

## Consecuencias

**Positivas:**
- Defensa legal sólida
- Compliance con Ley 24.240 y jurisprudencia reciente
- Audit trail para disputas
- Transparencia con el usuario

**Negativas:**
- Más código para generar PDFs
- Storage extra (bucket supabase)
- Users legacy deben re-aceptar (friction de UX una sola vez)

## Review legal

**Before GA (Fase 5):**
- Revisar texto de cláusula con abogado (compliance AR)
- Revisar template de PDF
- Revisar email template
- Validar que la firma digital cumple Ley 25.506 (si requerimos eso)

## Alternativas rechazadas

**No agregar cláusula**: riesgo legal.

**Firma electrónica con certificado**: over-engineering V1.

**Solo texto en email sin PDF**: menos formal.

## Relacionado

- ADR-004 (política escalonada aplica a la cláusula)
- ADR-002 (audit trail base)
- `declaration` existente en flujo mobile
