CREATE TABLE reservations (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id),
    car_id integer NOT NULL REFERENCES cars(id),
    mode text NOT NULL CHECK (mode IN ('fixed', 'metered')),
    hours integer,
    status text NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'active', 'cancelled', 'expired', 'completed')),
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    started_at timestamptz,
    finished_at timestamptz,
    CHECK ((mode = 'fixed' AND hours IS NOT NULL AND hours > 0) OR (mode = 'metered' AND hours IS NULL)),
    CHECK (expires_at > created_at),
    CHECK ((started_at IS NOT NULL) = (status IN ('active', 'completed'))),
    CHECK ((finished_at IS NOT NULL) = (status = 'completed'))
);

CREATE UNIQUE INDEX reservations_open_user_key ON reservations (user_id)
    WHERE status IN ('reserved', 'active');
CREATE UNIQUE INDEX reservations_open_car_key ON reservations (car_id)
    WHERE status IN ('reserved', 'active');
CREATE INDEX reservations_expiry_idx ON reservations (expires_at) WHERE status = 'reserved';
CREATE INDEX reservations_completed_user_idx ON reservations (user_id, id DESC) WHERE status = 'completed';
