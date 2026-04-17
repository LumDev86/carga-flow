# Sequence Diagrams — Fuel Tracking

## 1. Registro de cambio de precio (admin)

```mermaid
sequenceDiagram
    participant Admin as Admin User
    participant CRM as CRM (Next.js)
    participant API as Backend API
    participant DB as PostgreSQL
    participant OB as Outbox (DB)
    participant WS as WebSocket Gateway

    Admin->>CRM: Open /dashboard/fuel-prices
    Admin->>CRM: Enter new price + notes
    CRM->>API: GET /admin/fuel-prices/impact?newPrice=X&fuelType=COMUN
    API->>DB: Query active REALTIME trips
    API-->>CRM: { affectedTrips: 42, estimatedAdjustmentTotal: 125430 }
    CRM-->>Admin: Show impact preview

    Admin->>CRM: Confirm
    CRM->>CRM: generate idempotency_key (uuid v4)
    CRM->>API: POST /admin/fuel-prices<br/>Idempotency-Key: {uuid}<br/>{ fuelType, price, notes }

    rect rgb(240,240,255)
        API->>API: Validate admin role + rate limit
        API->>DB: BEGIN TX
        API->>DB: SELECT FROM fuel_price_history WHERE idempotency_key=$1
        alt idempotent retry
            DB-->>API: existing row
            API-->>CRM: 200 { existing_record }
        else new request
            API->>DB: INSERT INTO fuel_price_history
            API->>DB: INSERT INTO integration_outbox<br/>{ event_type: 'fuel.price.changed', ... }
            API->>DB: COMMIT
            API->>WS: emit 'fuel_price:updated' (global room)
            API-->>CRM: 201 { new_record }
        end
    end
    CRM-->>Admin: Success toast
```

## 2. Propagación async a trips activos

```mermaid
sequenceDiagram
    participant OB as Outbox Poller
    participant Q as BullMQ Queue
    participant W as Fuel Recalc Worker
    participant R as Redis (lock)
    participant DB as PostgreSQL
    participant GEO as GeolocationService
    participant WS as WebSocket Gateway
    participant Push as Expo Push

    loop every 2s
        OB->>DB: SELECT * FROM integration_outbox<br/>WHERE status='PENDING'<br/>FOR UPDATE SKIP LOCKED LIMIT 10
        alt items found
            DB-->>OB: rows
            OB->>DB: UPDATE status='PROCESSING'
            OB->>Q: enqueue job per item
        end
    end

    W->>Q: take job { priceChangeId }
    W->>DB: SELECT trips WHERE status IN (ASSIGNED,ACCEPTED,IN_TRANSIT)<br/>AND pricing_mode='REALTIME'<br/>AND accepted_at < NOW() - INTERVAL '30 min'

    loop for each trip (parallel, max 10)
        W->>R: SET fuel:recalc:trip:{id} NX EX 10
        alt lock acquired
            W->>DB: SELECT snapshot, latest location
            W->>GEO: calcKmTraveled(tripId, snapshot)
            GEO-->>W: kmTraveled
            W->>W: calc liters_remaining, adjustment_amount, pct_change
            W->>W: apply policy (SILENT/INFORMATIVE/EXPLICIT)

            rect rgb(240,255,240)
                W->>DB: BEGIN TX
                W->>DB: INSERT trip_fuel_adjustments status={PROPOSED | AUTO_APPLIED}
                alt AUTO_APPLIED
                    W->>DB: UPDATE trips SET total_fuel_adjustment += amount
                end
                W->>DB: COMMIT
            end

            W->>WS: emit 'trip:fuel_adjustment_applied' OR '..._proposed'<br/>to trip:{id} room

            alt policy != SILENT
                W->>Push: send notification to dador (+ chofer si AUTO)
            end

            W->>R: DEL lock
        else lock denied
            W->>W: skip (other worker processing)
        end
    end

    W->>DB: UPDATE outbox SET status='PROCESSED', processed_at=NOW()
```

## 3. Dador responde ajuste PROPOSED

```mermaid
sequenceDiagram
    participant D as Dador (mobile)
    participant App as RN App
    participant API as Backend API
    participant DB as PostgreSQL
    participant WS as WebSocket
    participant Push as Expo Push

    Push->>App: push "Precio gasoil cambió, revisa tu viaje"
    App->>API: GET /trips/:id/fuel-tracking
    API->>DB: SELECT snapshot + adjustments
    API-->>App: { snapshot, adjustments[] }
    App->>App: Render modal con PROPOSED adjustment
    D->>App: Accept button

    App->>API: POST /trips/:id/fuel-adjustments/:adjId/accept
    rect rgb(240,255,240)
        API->>API: Verify ownership (dador of trip)
        API->>DB: BEGIN TX
        API->>DB: UPDATE trip_fuel_adjustments<br/>SET status='ACCEPTED', responded_by, responded_at<br/>WHERE id=:adjId AND status='PROPOSED'
        alt row updated
            API->>DB: UPDATE trips SET total_fuel_adjustment += amount
            API->>DB: COMMIT
            API->>WS: emit 'trip:fuel_adjustment_applied' to trip:{id}
            API->>Push: notify chofer "Ajuste aceptado"
            API-->>App: 200 { adjustment }
        else already responded / expired
            DB-->>API: 0 rows
            API->>DB: ROLLBACK
            API-->>App: 409 Conflict
            App->>App: Refresh state, show "Ya fue respondido"
        end
    end
```

## 4. Creación de trip y snapshot

```mermaid
sequenceDiagram
    participant Req as Requester (dador)
    participant App as RN App
    participant API as Backend API
    participant DB as PostgreSQL
    participant Fuel as FuelSnapshot Svc
    participant WS as WebSocket

    Req->>App: Create shipment
    App->>API: POST /trips { origin, dest, cargoType, weight }
    API->>API: calculatePricing (existing flow)
    API->>DB: BEGIN TX
    API->>DB: INSERT INTO trips { ..., pricing_mode based on distance }

    Note over API,DB: Note: fuel_snapshot_id null hasta que chofer acepte

    API->>DB: COMMIT
    API-->>App: 201 { trip }

    Note over Req,API: ... later: chofer accepts ...

    API->>API: TripsService.acceptTrip(tripId, driverId)
    rect rgb(255,240,240)
        API->>DB: UPDATE trips SET status='ACCEPTED', driver_id, accepted_at
        alt pricing_mode = REALTIME AND feature_flag enabled AND dador in rollout
            API->>Fuel: createSnapshot(trip, vehicle)
            Fuel->>DB: SELECT current price from fuel_price_history
            Fuel->>Fuel: resolve vehicle consumption (fallback chain)
            Fuel->>DB: INSERT trip_fuel_snapshots
            Fuel->>DB: UPDATE trips SET fuel_snapshot_id
            Fuel-->>API: snapshot
        end
        API->>WS: emit 'trip:accepted' + 'trip:fuel_snapshot_created'
    end
```

## 5. Cierre de viaje y liquidación

```mermaid
sequenceDiagram
    participant C as Chofer
    participant App as RN
    participant API as Backend
    participant DB as PostgreSQL
    participant Admin as Admin (CRM)
    participant Stripe

    C->>App: Complete delivery + upload evidence
    App->>API: POST /trips/:id/complete { remitoUrl, observations }

    rect rgb(240,255,255)
        API->>API: TripsService.completeTrip(tripId)
        API->>DB: BEGIN TX
        API->>DB: UPDATE trips SET status='DELIVERED', delivered_at
        API->>DB: UPDATE trip_fuel_adjustments<br/>SET status='EXPIRED'<br/>WHERE trip_id=:id AND status='PROPOSED'
        API->>DB: UPDATE trips SET actual_final_amount = price + total_fuel_adjustment
        API->>DB: COMMIT
        API->>App: 200
    end

    Note over Admin,API: ... later: admin confirms flete received ...

    Admin->>API: POST /trips/:id/confirm-flete { fleteAmount }
    rect rgb(240,240,255)
        API->>API: confirmFleteReceived (existing flow)
        API->>DB: SELECT trip FOR UPDATE
        API->>API: effectiveAmount = fleteAmount || trip.actual_final_amount || trip.price
        API->>API: driverPayout = effectiveAmount - commission
        API->>DB: UPDATE trips SET fleteAmount, driverPayout, paymentStatus='driver_credited'
        API->>DB: UPDATE users SET wallet_balance += driverPayout
        API->>DB: INSERT wallet_transactions { type: CREDIT }
        API->>DB: COMMIT
        API-->>Admin: 200
    end
```

## 6. Cron de expiración de PROPOSED

```mermaid
sequenceDiagram
    participant Cron as NestJS Cron
    participant DB as PostgreSQL
    participant WS as WebSocket
    participant Push

    loop every 5 min
        Cron->>DB: SELECT * FROM trip_fuel_adjustments<br/>WHERE status='PROPOSED'<br/>AND auto_apply_deadline < NOW()

        loop for each
            Cron->>DB: BEGIN TX
            Cron->>DB: UPDATE status='AUTO_APPLIED' WHERE status='PROPOSED'
            alt row updated (not already responded)
                Cron->>DB: UPDATE trips SET total_fuel_adjustment += amount
                Cron->>DB: COMMIT
                Cron->>WS: emit 'trip:fuel_adjustment_applied'
                Cron->>Push: notify "Ajuste aplicado por vencimiento de ventana"
            else already responded
                Cron->>DB: ROLLBACK (no-op)
            end
        end
    end
```

## 7. GPS upload batch (mobile)

```mermaid
sequenceDiagram
    participant App as RN App
    participant API
    participant DB

    loop every 30s or on significant move
        App->>App: collect GPS points (local queue)
    end

    loop every 2 min (or when queue >= 20 points)
        App->>API: POST /trips/:id/location<br/>{ points: [{lat,lng,speed,accuracy,recordedAt},...] }
        API->>API: Verify ownership (driver of trip)
        API->>DB: INSERT multi-row INTO trip_location_history
        API-->>App: 202 Accepted
        App->>App: clear local queue
    end
```

## 8. Admin revierte un cambio (rollback manual)

```mermaid
sequenceDiagram
    participant Admin
    participant CRM
    participant API
    participant DB

    Note over Admin,API: Caso: admin ingresó $2100 por error, quiere volver a $1950

    Admin->>CRM: Click "Revertir último cambio"
    CRM->>API: POST /admin/fuel-prices<br/>{ fuelType: COMUN, price: 1950, notes: "Rollback error", source: SYSTEM_ROLLBACK }
    API->>DB: INSERT NEW row en fuel_price_history<br/>(la row errónea queda en el histórico)
    API->>DB: INSERT outbox event
    Note over API: Worker recalcula trips con delta de $1950-$2100 (negativo)
    Note over API: Trips reciben ajuste inverso
```

## Notas sobre los flujos

1. **Todos los flujos son idempotentes** en puntos críticos (POST admin, accept adjustment, complete trip).
2. **Locks pesimistas** en trips y wallet se mantienen según el patrón actual del código.
3. **Outbox polling** con `FOR UPDATE SKIP LOCKED` permite múltiples pollers seguros en cluster.
4. **BullMQ jobs** tienen retry con backoff exponencial (3s, 15s, 60s) y DLQ.
5. **WebSocket events** se emiten **fuera** de la transacción (pueden fallar sin afectar consistencia de datos).
6. **Push notifications** son best-effort, no bloquean ni revierten.
