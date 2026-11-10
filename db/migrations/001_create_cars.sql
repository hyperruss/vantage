CREATE TABLE cars (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    make text NOT NULL,
    model text NOT NULL,
    body_style text NOT NULL,
    plate text NOT NULL UNIQUE,
    latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180)
);
