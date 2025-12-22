# CargaFlow Backend - NestJS API

Plataforma logística integral para gestión de cargas, transportistas y puertos. Backend desarrollado con NestJS, PostgreSQL y Supabase.

## 🚀 Descripción

CargaFlow es el "Uber de los camiones" - una plataforma que conecta:
- **Solicitantes** de carga (empresas que necesitan transporte)
- **Transportistas** (choferes con camiones)
- **Puertos/Acopios** (centros de carga/descarga)
- **Administradores** (gestión centralizada)

## 📋 Stack Tecnológico

- **Framework**: NestJS 10.x
- **Lenguaje**: TypeScript 5.x
- **Base de Datos**: PostgreSQL + PostGIS (vía Supabase)
- **ORM**: TypeORM
- **Autenticación**: Supabase Auth + JWT
- **Storage**: Supabase Storage
- **Documentación API**: Swagger/OpenAPI
- **Validación**: class-validator + class-transformer
- **Geolocalización**: Google Maps API
- **Push Notifications**: Firebase Cloud Messaging
- **Colas**: Bull (Redis)

## 📁 Estructura del Proyecto

```
Backend/
├── src/
│   ├── modules/                 # Módulos funcionales
│   │   ├── auth/               # Autenticación y registro
│   │   ├── users/              # Gestión de usuarios
│   │   ├── trips/              # Viajes/Cargas (core)
│   │   ├── geolocation/        # Geocoding, rutas, tracking
│   │   ├── documents/          # Gestión documental
│   │   ├── pricing/            # Motor tarifario
│   │   ├── assignments/        # Asignación de viajes
│   │   ├── billing/            # Cobranzas y liquidaciones
│   │   ├── wallet/             # Billetera interna
│   │   ├── notifications/      # Push y Email
│   │   ├── ports/              # Puertos/Acopios
│   │   ├── admin/              # CRM administrativo
│   │   ├── evidence/           # Evidencias fotográficas
│   │   ├── turns/              # Sistema de turnos
│   │   └── analytics/          # Dashboards y métricas
│   ├── common/                 # Código compartido
│   │   ├── guards/             # AuthGuard, RolesGuard
│   │   ├── decorators/         # @User(), @Roles()
│   │   ├── filters/            # Exception filters
│   │   ├── interceptors/       # Logging, Transform
│   │   ├── pipes/              # Validation pipes
│   │   └── dto/                # DTOs compartidos
│   ├── config/                 # Configuraciones
│   ├── database/               # Migrations y seeds
│   ├── shared/                 # Enums e interfaces
│   ├── app.module.ts
│   └── main.ts
├── src/database/               # Entities, migrations y seeds (TypeORM)
├── test/                       # Tests E2E
├── .env.example
└── package.json
```

## 🛠️ Instalación y Setup

### Prerrequisitos

- Node.js >= 18.x
- npm >= 9.x
- PostgreSQL >= 14.x (o cuenta Supabase)
- Redis (para colas)

### 1. Clonar el repositorio

```bash
cd Backend
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copia el archivo `.env.example` a `.env` y completa las variables:

```bash
cp .env.example .env
```

Variables críticas a configurar:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `JWT_SECRET`
- `GOOGLE_MAPS_API_KEY`

### 4. Ejecutar migraciones de TypeORM

```bash
# Ejecutar migraciones
npm run migration:run

# Generar nueva migración
npm run migration:generate -- -n NombreMigracion
```

### 5. Iniciar el servidor

```bash
# Modo desarrollo
npm run start:dev

# Modo producción
npm run build
npm run start:prod
```

El servidor estará disponible en:
- API: http://localhost:3000/api
- Swagger: http://localhost:3000/api/docs

## 📚 Documentación API

La documentación completa de la API está disponible en Swagger:

```
http://localhost:3000/api/docs
```

### Endpoints principales

- `GET /api` - Health check
- `GET /api/health` - Detailed health check
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Registro
- `GET /api/trips` - Listar viajes
- `POST /api/trips` - Crear viaje
- ... (más endpoints en Swagger)

## 🔐 Autenticación

El sistema usa **Supabase Auth** para registro/login y **JWT** para proteger endpoints.

### Flow de autenticación:

1. Usuario se registra/loguea → Supabase Auth genera JWT
2. Cliente envía JWT en header: `Authorization: Bearer <token>`
3. Backend valida JWT y extrae user_id
4. Guards verifican roles y permisos

### Uso en controllers:

```typescript
@Controller('trips')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TripsController {

  @Post()
  @Roles('SOLICITANTE', 'PUERTO')
  async createTrip(@User() user, @Body() dto: CreateTripDto) {
    // Solo solicitantes y puertos pueden crear viajes
  }
}
```

## 🗄️ Base de Datos

### Entidades principales:

- **Users** - Usuarios del sistema
- **Drivers** - Transportistas
- **Vehicles** - Camiones
- **Trips** - Viajes/Cargas (entidad central)
- **Documents** - Documentación
- **Evidences** - Evidencias fotográficas
- **Transactions** - Transacciones financieras
- **Ports** - Puertos/Acopios
- **Turn_Queue** - Cola de turnos

### Migraciones:

```bash
# Crear nueva migración
npm run migration:generate -- -n NombreMigracion

# Ejecutar migraciones
npm run migration:run

# Revertir última migración
npm run migration:revert

# Sincronizar schema en desarrollo (⚠️ solo desarrollo)
npm run typeorm:sync
```

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

## 📦 Scripts disponibles

```bash
npm run start          # Iniciar servidor
npm run start:dev      # Modo desarrollo (watch)
npm run start:prod     # Modo producción
npm run build          # Compilar proyecto
npm run lint           # Lint con ESLint
npm run format         # Format con Prettier
```

## 🌍 Variables de Entorno

Ver `.env.example` para la lista completa de variables.

### Críticas:

- `NODE_ENV` - Entorno (development/production)
- `PORT` - Puerto del servidor (default: 3000)
- `DATABASE_URL` - Conexión a PostgreSQL
- `SUPABASE_*` - Credenciales de Supabase
- `JWT_SECRET` - Secret para firmar tokens
- `GOOGLE_MAPS_API_KEY` - API key de Google Maps

## 🚦 Roadmap de Desarrollo

### Fase 0 - Descubrimiento (Actual)
- ✅ Setup inicial del proyecto
- ✅ Estructura de carpetas
- ✅ Configuración de Swagger
- ⏳ Definir entidades TypeORM completas

### Fase 1 - MVP Operativo (6 semanas)
- Base técnica (Auth, DB, CI/CD)
- Geolocalización
- App Solicitante básica
- App Transportista básica
- Asignación semi-automática
- Documentación básica

### Fase 2 - Operación Completa (2 meses)
- CRM completo
- Cobranzas y liquidaciones
- Billetera interna
- Documentación avanzada (vencimientos, alertas)
- Dashboards y métricas

## 🤝 Contribución

Por definir las guías de contribución.

## 📄 Licencia

Propiedad de Marcos Bullo / Whapy LLC

## 👥 Equipo

- **Cliente**: Marcos Bullo
- **Desarrollo**: Whapy LLC

---

**Versión**: 1.0.0
**Última actualización**: Diciembre 2025
