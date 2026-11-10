CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
    phone text,
    telegram_tag text,
    telegram_id bigint UNIQUE CHECK (telegram_id > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);

CREATE INDEX user_sessions_user_id_idx ON user_sessions (user_id);
