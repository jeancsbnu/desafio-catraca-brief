-- F05: ingressos. Ocupam vaga os status pending e confirmed (R05); a lotação é garantida pela trava
-- da linha do evento na transação da compra (R07). Ingressos nunca são apagados. O gatilho
-- tickets_guard_update recusa transições de status fora do ciclo do brief (R08, R11), mudança de
-- campos imutáveis (inclusive o valor pago, R03) e desfazer o check-in.
CREATE TABLE tickets (
    id                text        PRIMARY KEY,
    event_id          text        NOT NULL REFERENCES events (id),
    code              text        NOT NULL,
    status            text        NOT NULL DEFAULT 'pending',
    checked_in        boolean     NOT NULL DEFAULT false,
    checked_in_at     timestamptz,
    price_paid_cents  integer     NOT NULL,
    channel           text        NOT NULL,
    buyer_user_id     text        REFERENCES users (id),
    buyer_email       text        NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
    status_changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT tickets_id_format          CHECK (id ~ '^tkt_[a-z0-9]{16}$'),
    CONSTRAINT tickets_code_format        CHECK (code ~ '^[A-Z0-9]{8}$'),
    CONSTRAINT tickets_status_check       CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled', 'refunded')),
    CONSTRAINT tickets_channel_check      CHECK (channel IN ('vitrine', 'api')),
    CONSTRAINT tickets_buyer_by_channel   CHECK ((channel = 'vitrine') = (buyer_user_id IS NOT NULL)),
    CONSTRAINT tickets_buyer_email_format CHECK (char_length(buyer_email) BETWEEN 3 AND 254
                                                 AND buyer_email = lower(buyer_email)
                                                 AND buyer_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
    CONSTRAINT tickets_price_paid_range   CHECK (price_paid_cents BETWEEN 1 AND 100000000),
    CONSTRAINT tickets_checked_in_at      CHECK (checked_in = (checked_in_at IS NOT NULL)),
    CONSTRAINT tickets_checked_in_status  CHECK (NOT checked_in OR status IN ('confirmed', 'refunded'))
);

CREATE UNIQUE INDEX tickets_code_key ON tickets (code);
CREATE INDEX tickets_event_status_idx ON tickets (event_id, status);
CREATE INDEX tickets_buyer_idx ON tickets (buyer_user_id, created_at DESC, id DESC) WHERE buyer_user_id IS NOT NULL;

CREATE FUNCTION tickets_guard_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id <> OLD.id OR NEW.event_id <> OLD.event_id OR NEW.code <> OLD.code
       OR NEW.price_paid_cents <> OLD.price_paid_cents OR NEW.channel <> OLD.channel
       OR NEW.buyer_user_id IS DISTINCT FROM OLD.buyer_user_id OR NEW.buyer_email <> OLD.buyer_email
       OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'ingressos: campo imutável alterado no ingresso %', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
           (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'declined', 'cancelled'))
        OR (OLD.status = 'confirmed' AND NEW.status = 'refunded')) THEN
        RAISE EXCEPTION 'ingressos: transição de status inválida (% -> %) no ingresso %', OLD.status, NEW.status, OLD.id
            USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.checked_in AND NOT NEW.checked_in THEN
        RAISE EXCEPTION 'ingressos: check-in não pode ser desfeito no ingresso %', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    IF NOT OLD.checked_in AND NEW.checked_in AND NOT (OLD.status = 'confirmed' AND NEW.status = 'confirmed') THEN
        RAISE EXCEPTION 'ingressos: check-in só de ingresso confirmado (%)', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER tickets_guard_update BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION tickets_guard_update();
