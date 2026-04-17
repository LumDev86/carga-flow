# ADR-010: Feature flags en tabla DB para rollout gradual

**Status:** Accepted
**Date:** 2026-04-17

## Contexto

El sistema de fuel tracking es crítico (financiero). Un bug puede generar ajustes incorrectos a cientos de viajes. Necesitamos:
- Deploy sin activar la feature
- Rollout gradual por % de usuarios
- Rollback sin deploy

Opciones:

**A) Env vars**
`FUEL_TRACKING_ENABLED=true` en `.env`.

**B) Tabla `feature_flags` en DB**
Flags editables via endpoint admin sin deploy.

**C) SaaS externo (LaunchDarkly, Unleash, PostHog)**
Servicio dedicado de feature flags.

## Decisión

**Opción B** — tabla `feature_flags` en la misma DB.

## Rationale

### Contra (A)
- **Requiere deploy para cambiar**: restart del container, invalida caché, ~1-2 min downtime
- **No hay UI**: admin necesita acceso al servidor
- **No soporta gradualidad**: ON/OFF binario, no "50% de usuarios"
- **No hay audit trail**: quién cambió qué cuándo

### Contra (C)
- **Dependencia externa**: otro servicio que puede fallar
- **Costo**: $$$ en features pagas
- **Over-engineering**: tenemos 3 flags, no 300
- **Latencia**: round-trip al SaaS en cada chequeo (mitigable con SDK caché, pero complica)

### A favor de (B)
- **Zero infra nueva**: usamos PostgreSQL que ya tenemos
- **Hot reload**: cambio se refleja en siguiente cache invalidation (Redis pub/sub)
- **Audit trail**: `updated_by`, `updated_at` capturan quién y cuándo
- **UI nativa**: CRM puede tener página de flags
- **Gradualidad**: `FUEL_ROLLOUT_PCT = 10` es un valor, fácil de cambiar

## Implementación

### Schema

```sql
CREATE TABLE feature_flags (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Value es JSONB para flexibilidad (boolean, number, objeto de config).

### Service

```typescript
@Injectable()
export class FeatureFlagService {
  private cache = new Map<string, { value: any; expiresAt: number }>();
  private readonly TTL_MS = 30_000; // 30s

  async isEnabled(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value === true;
  }

  async get<T>(key: string): Promise<T | null> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const row = await this.repo.findOne({ where: { key } });
    const value = row?.value ?? null;
    this.cache.set(key, { value, expiresAt: Date.now() + this.TTL_MS });
    return value;
  }

  async isUserInRollout(userId: string, pctKey: string): Promise<boolean> {
    const pct = (await this.get<number>(pctKey)) ?? 0;
    if (pct >= 100) return true;
    if (pct <= 0) return false;
    const hash = parseInt(createHash('sha256').update(userId).digest('hex').slice(0, 8), 16);
    return (hash % 100) < pct;
  }

  async set(key: string, value: any, updatedBy: string): Promise<void> {
    await this.repo.upsert({ key, value, updatedBy, updatedAt: new Date() }, ['key']);
    this.cache.delete(key);
    await this.redis.publish('feature_flag:updated', key);
  }
}
```

### Invalidation via pub/sub

Al actualizar flag, publicar en Redis. Otros pods invalidan su cache local.

```typescript
async onModuleInit() {
  await this.redis.subscribe('feature_flag:updated');
  this.redis.on('message', (_, key) => this.cache.delete(key));
}
```

### Hash estable para rollout pct

Dos implementaciones posibles:
- Hash del `userId` solo → mismo user siempre cae igual
- Hash del `userId + featureKey` → diferentes users en diferentes features

Elegimos la primera para V1 (más simple, testeable). Si queremos exposición diferente por feature, cambiamos fácil.

## Flags iniciales

| Key | Tipo | Default | Propósito |
|---|---|---|---|
| `FUEL_TRACKING_ENABLED` | boolean | `false` | Master switch |
| `FUEL_AUTO_APPLY_ENABLED` | boolean | `false` | Si false, todo es PROPOSED (sin SILENT ni INFORMATIVE automáticos) |
| `FUEL_ROLLOUT_PCT` | number | `0` | % dadores con feature activa |

## Guards

```typescript
if (!(await flags.isEnabled('FUEL_TRACKING_ENABLED'))) {
  return; // feature off, skip
}
if (!(await flags.isUserInRollout(trip.requesterId, 'FUEL_ROLLOUT_PCT'))) {
  return; // user not in rollout, skip
}
// proceed with fuel logic
```

## Consecuencias

**Positivas:**
- Deploy seguro (OFF por default)
- Rollback < 1s (UPDATE + pub/sub invalida)
- Gradualidad progresiva
- Audit trail

**Negativas:**
- Un query más (mitigado por cache 30s)
- Dev debe recordar chequear flag antes de ejecutar lógica

## Alternativas rechazadas

- **ConfigService de NestJS**: igual que env vars, requiere restart.
- **Launchdarkly/Unleash**: overkill para este scope.

## Relacionado

- ADR-004 (threshold — `FUEL_AUTO_APPLY_ENABLED=false` degrada todo a EXPLICIT)
- ROLLOUT.md (plan de fases)
