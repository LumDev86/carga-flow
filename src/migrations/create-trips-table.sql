-- =====================================================
-- Script para crear la tabla trips y los ENUMs necesarios
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Crear los tipos ENUM si no existen
DO $$ BEGIN
    CREATE TYPE trip_status AS ENUM (
        'PENDING',
        'ASSIGNED',
        'BROADCAST',
        'ACCEPTED',
        'IN_TRANSIT',
        'DELIVERED',
        'CANCELLED',
        'EXPIRED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE transport_type AS ENUM (
        'CAMION',
        'CAMIONETA',
        'AUTO',
        'MOTO',
        'SEMI_REMOLQUE'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE cargo_type AS ENUM (
        'CARGA_SIMPLE',
        'CARGA_PESADA',
        'CARGA_EXPRESS',
        'CARGA_PEQUENO',
        'ENVIO_PREMIUM'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Crear la tabla trips
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relaciones
    requester_id UUID NOT NULL REFERENCES users(id),
    driver_id UUID REFERENCES users(id),

    -- Estado
    status trip_status NOT NULL DEFAULT 'PENDING',

    -- Origen
    origin_address VARCHAR NOT NULL,
    origin_lat DECIMAL(10, 7) NOT NULL,
    origin_lng DECIMAL(10, 7) NOT NULL,
    origin_city VARCHAR,
    origin_state VARCHAR,

    -- Destino
    destination_address VARCHAR NOT NULL,
    destination_lat DECIMAL(10, 7) NOT NULL,
    destination_lng DECIMAL(10, 7) NOT NULL,
    destination_city VARCHAR,
    destination_state VARCHAR,

    -- Carga
    cargo_description VARCHAR NOT NULL,
    cargo_type cargo_type NOT NULL DEFAULT 'CARGA_SIMPLE',
    transport_type transport_type NOT NULL DEFAULT 'CAMION',
    cargo_weight DECIMAL(10, 2),
    cargo_weight_unit VARCHAR DEFAULT 'kg',
    cargo_pallets INTEGER,
    cargo_fragile BOOLEAN DEFAULT false,
    cargo_instructions TEXT,

    -- Pricing
    distance_km DECIMAL(10, 2),
    estimated_duration VARCHAR,
    price DECIMAL(10, 2) NOT NULL,
    commission DECIMAL(10, 2) DEFAULT 0,
    driver_payout DECIMAL(10, 2) DEFAULT 0,

    -- Schedule
    scheduled_pickup_at TIMESTAMP,
    estimated_delivery_at TIMESTAMP,

    -- Assignment tracking
    assigned_driver_id UUID,
    assignment_expires_at TIMESTAMP,
    broadcast_at TIMESTAMP,

    -- Timestamps reales
    accepted_at TIMESTAMP,
    picked_up_at TIMESTAMP,
    delivered_at TIMESTAMP,
    cancelled_at TIMESTAMP,

    -- Evidencia
    remito_url VARCHAR,
    cargo_photo_url VARCHAR,
    observations TEXT,

    -- Rating
    rating INTEGER,
    rating_comments TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Crear índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_trips_requester_id ON trips(requester_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_created_at ON trips(created_at);

-- 4. Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 5. Trigger para updated_at
DROP TRIGGER IF EXISTS update_trips_updated_at ON trips;
CREATE TRIGGER update_trips_updated_at
    BEFORE UPDATE ON trips
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. Verificar que se creó correctamente
SELECT 'Tabla trips creada exitosamente' AS resultado;
SELECT COUNT(*) AS total_trips FROM trips;
