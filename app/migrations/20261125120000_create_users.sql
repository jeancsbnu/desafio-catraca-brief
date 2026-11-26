CREATE TABLE users (
    id            text        PRIMARY KEY,
    name          text        NOT NULL,
    email         text        NOT NULL,
    password_hash text        NOT NULL,
    role          text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_id_format    CHECK (id ~ '^usr_[a-z0-9]{16}$'),
    CONSTRAINT users_name_length  CHECK (char_length(name) BETWEEN 1 AND 100),
    CONSTRAINT users_email_length CHECK (char_length(email) BETWEEN 3 AND 254),
    CONSTRAINT users_role_check   CHECK (role IN ('organizador', 'participante'))
);

CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
