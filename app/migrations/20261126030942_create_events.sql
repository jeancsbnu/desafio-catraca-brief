-- F04 — Gestão de eventos: tabela events (dono, dados, preço vigente em centavos e status).
-- A data no futuro (R01) é validada pela aplicação ao criar e ao editar (depende do relógio).
CREATE TABLE events (
    id           text        PRIMARY KEY,
    organizer_id text        NOT NULL REFERENCES users (id),
    name         text        NOT NULL,
    starts_at    timestamptz NOT NULL,
    location     text        NOT NULL,
    capacity     integer     NOT NULL,
    price_cents  integer     NOT NULL,
    status       text        NOT NULL DEFAULT 'rascunho',
    published_at timestamptz,
    cancelled_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT events_id_format           CHECK (id ~ '^evt_[a-z0-9]{16}$'),
    CONSTRAINT events_name_length         CHECK (char_length(name) BETWEEN 1 AND 120),
    CONSTRAINT events_location_length     CHECK (char_length(location) BETWEEN 1 AND 200),
    CONSTRAINT events_capacity_range      CHECK (capacity BETWEEN 1 AND 1000000),
    CONSTRAINT events_price_cents_range   CHECK (price_cents BETWEEN 1 AND 100000000),
    CONSTRAINT events_status_check        CHECK (status IN ('rascunho', 'publicado', 'cancelado')),
    CONSTRAINT events_published_at_status CHECK ((status = 'rascunho') = (published_at IS NULL)),
    CONSTRAINT events_cancelled_at_status CHECK ((status = 'cancelado') = (cancelled_at IS NOT NULL))
);

CREATE INDEX events_organizer_starts_idx ON events (organizer_id, starts_at);
CREATE INDEX events_on_sale_idx ON events (starts_at) WHERE status = 'publicado';
