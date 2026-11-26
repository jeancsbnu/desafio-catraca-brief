-- F03: tentativas de pagamento do gateway simulado. Só os 4 últimos dígitos do cartão são guardados.
CREATE TABLE payment_attempts (
    id                text        PRIMARY KEY,
    origin            text        NOT NULL,
    reference         text        NOT NULL,
    card_last4        text        NOT NULL,
    result            text        NOT NULL,
    delay_ms          integer     NOT NULL,
    requested_at      timestamptz NOT NULL,
    due_at            timestamptz NOT NULL,
    next_delivery_at  timestamptz NOT NULL,
    delivered_at      timestamptz,
    delivery_attempts integer     NOT NULL DEFAULT 0,
    last_error        text,
    updated_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT payment_attempts_id_format         CHECK (id ~ '^pay_[a-z0-9]{16}$'),
    CONSTRAINT payment_attempts_origin_check      CHECK (origin IN ('compra', 'diagnostico')),
    CONSTRAINT payment_attempts_reference_format  CHECK (reference ~ '^[A-Za-z0-9_-]{1,64}$'),
    CONSTRAINT payment_attempts_card_last4_format CHECK (card_last4 ~ '^[0-9]{4}$'),
    CONSTRAINT payment_attempts_result_check      CHECK (result IN ('aprovado', 'recusado')),
    CONSTRAINT payment_attempts_delay_check       CHECK (delay_ms >= 0),
    CONSTRAINT payment_attempts_due_check         CHECK (due_at >= requested_at),
    CONSTRAINT payment_attempts_next_check        CHECK (next_delivery_at >= due_at),
    CONSTRAINT payment_attempts_attempts_check    CHECK (delivery_attempts >= 0),
    CONSTRAINT payment_attempts_delivered_check   CHECK (delivered_at IS NULL OR (delivered_at >= due_at AND delivery_attempts >= 1))
);

CREATE UNIQUE INDEX payment_attempts_origin_reference_key ON payment_attempts (origin, reference);
CREATE INDEX payment_attempts_pending_idx ON payment_attempts (next_delivery_at) WHERE delivered_at IS NULL;
