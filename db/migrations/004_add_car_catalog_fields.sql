ALTER TABLE cars
    ADD COLUMN fleet_number integer CHECK (fleet_number > 0),
    ADD COLUMN available boolean NOT NULL DEFAULT true,
    ADD COLUMN walk_minutes smallint CHECK (walk_minutes >= 0),
    ADD COLUMN photo_url text;

UPDATE cars
SET fleet_number = CASE plate
    WHEN 'А123ВС 38' THEN 3
    WHEN 'К714МЕ 38' THEN 7
    WHEN 'М508ТХ 38' THEN 12
    ELSE id + 12
END;

UPDATE cars AS car
SET walk_minutes = catalog.walk_minutes, photo_url = catalog.photo_url
FROM (VALUES
    ('А123ВС 38', 6, '/cars/kia-k5.jpg'),
    ('К714МЕ 38', 9, '/cars/toyota-camry.webp'),
    ('М508ТХ 38', 12, '/cars/hyundai-sonata.webp')
) AS catalog(plate, walk_minutes, photo_url)
WHERE car.plate = catalog.plate;

ALTER TABLE cars
    ALTER COLUMN fleet_number SET NOT NULL,
    ADD CONSTRAINT cars_fleet_number_key UNIQUE (fleet_number);
