CREATE FUNCTION vantage_ride_seconds(began_at timestamptz, ended_at timestamptz)
RETURNS bigint
LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ended_at - began_at)))::bigint
$$;

CREATE FUNCTION vantage_ride_kopecks(
    fare_mode text, booked_hours integer, fixed_hour integer, metered_minute integer, elapsed bigint
)
RETURNS bigint
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN elapsed IS NULL THEN NULL
        WHEN fare_mode = 'fixed' THEN booked_hours::bigint * fixed_hour
            + (GREATEST(0, elapsed - booked_hours::bigint * 3600) * metered_minute + 30) / 60
        ELSE (elapsed * metered_minute + 30) / 60
    END
$$;

-- Existing bookings retain the prices shown when they were created.
ALTER TABLE reservations
    ADD COLUMN fixed_hour_kopecks integer NOT NULL DEFAULT 59900 CHECK (fixed_hour_kopecks > 0),
    ADD COLUMN metered_minute_kopecks integer NOT NULL DEFAULT 1300 CHECK (metered_minute_kopecks > 0),
    ADD COLUMN elapsed_seconds bigint CHECK (elapsed_seconds >= 0),
    ADD COLUMN total_kopecks bigint CHECK (total_kopecks >= 0);

UPDATE reservations
SET elapsed_seconds = vantage_ride_seconds(started_at, finished_at),
    total_kopecks = vantage_ride_kopecks(
        mode, hours, fixed_hour_kopecks, metered_minute_kopecks, vantage_ride_seconds(started_at, finished_at)
    )
WHERE status = 'completed';

ALTER TABLE reservations
    ALTER COLUMN fixed_hour_kopecks DROP DEFAULT,
    ALTER COLUMN metered_minute_kopecks DROP DEFAULT,
    ADD CONSTRAINT reservations_elapsed_when_completed
        CHECK ((elapsed_seconds IS NOT NULL) = (status = 'completed')),
    ADD CONSTRAINT reservations_total_when_completed
        CHECK ((total_kopecks IS NOT NULL) = (status = 'completed'));
