// POST /api/partner/events/{eventId}/purchases (spec 5.1, 5.4): 202, e os erros na ordem do brief
// (422 → 404 → 409), sempre pelo serviço de compra da F05 com o canal api.
import { describe, expect, it, vi } from 'vitest';
import { insertTestTicket } from '../helpers/tickets.js';
import {
  BRIEF_BODY,
  EVENT_NOT_AVAILABLE,
  INVALID_REQUEST,
  JSON_TYPE,
  PURCHASE_ACCEPTED,
  SOLD_OUT,
  captureLogLines,
  countRows,
  occupiedAndTotal,
  parseLogLines,
  rawPurchase,
  setup,
  type RawPurchase,
} from './support.js';


/** Os 19 corpos/Content-Type inválidos do contrato (C03). */
const INVALID_BODIES: [label: string, options: RawPurchase][] = [
  ['falta-buyerEmail', { payload: '{"cardNumber":"4000000000000001"}' }],
  ['falta-cardNumber', { payload: '{"buyerEmail":"ana@example.com"}' }],
  ['objeto-vazio', { payload: '{}' }],
  ['email-mal-formado', { payload: '{"buyerEmail":"nao-e-um-email","cardNumber":"4000000000000001"}' }],
  ['email-null', { payload: '{"buyerEmail":null,"cardNumber":"4000000000000001"}' }],
  ['cartao-123', { payload: '{"buyerEmail":"ana@example.com","cardNumber":"123"}' }],
  ['cartao-15-digitos', { payload: '{"buyerEmail":"ana@example.com","cardNumber":"400000000000001"}' }],
  ['cartao-17-digitos', { payload: '{"buyerEmail":"ana@example.com","cardNumber":"40000000000000011"}' }],
  ['cartao-com-letra', { payload: '{"buyerEmail":"ana@example.com","cardNumber":"400000000000000A"}' }],
  ['cartao-com-espacos', { payload: '{"buyerEmail":"ana@example.com","cardNumber":"4000 0000 0000 0001"}' }],
  ['cartao-numero-json', { payload: '{"buyerEmail":"ana@example.com","cardNumber":4000000000000001}' }],
  ['json-malformado', { payload: '{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001"' }],
  ['nao-e-json', { payload: 'isto não é json' }],
  ['array', { payload: '[{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001"}]' }],
  ['null', { payload: 'null' }],
  ['corpo-vazio', { payload: '' }],
  ['sem-content-type', { contentType: null }],
  ['text-plain', { contentType: 'text/plain' }],
  ['formulario', { contentType: 'application/x-www-form-urlencoded', payload: 'buyerEmail=ana%40example.com&cardNumber=4000000000000001' }],
];

describe('F07 compra pela API', () => {
  it('F07-CA02 corpo válido responde 202 com exatamente ticketId, code e status pending, sem esperar o gateway', async () => {
    const { app, db, event } = await setup();
    const e = await event({ capacity: 5, priceCents: 12345 });
    const started = performance.now();
    const response = await rawPurchase(app, e.id, { payload: '{"buyerEmail":"  Ana@Example.COM ","cardNumber":"4000000000000001"}' });
    const elapsed = performance.now() - started;

    expect(response.statusCode).toBe(202);
    expect(response.headers['content-type']).toBe(JSON_TYPE);
    expect(response.headers['set-cookie']).toBeUndefined();
    const match = PURCHASE_ACCEPTED.exec(response.body);
    expect(match, response.body).not.toBeNull();
    expect(elapsed).toBeLessThan(1000);

    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT t.code, t.event_id, t.status, t.channel, t.buyer_user_id, t.buyer_email, t.price_paid_cents,
              p.delivered_at, p.origin
         FROM tickets t JOIN payment_attempts p ON p.reference = t.id WHERE t.id = $1`,
      [match?.[1]],
    );
    expect(rows).toEqual([
      {
        code: match?.[2],
        event_id: e.id,
        status: 'pending',
        channel: 'api',
        buyer_user_id: null,
        buyer_email: 'ana@example.com',
        price_paid_cents: 12345,
        delivered_at: null,
        origin: 'compra',
      },
    ]);
  });

  it('F07-CA02 Content-Type com charset e campos extras são aceitos; extras não mudam canal nem evento', async () => {
    const { app, db, event } = await setup();
    const e = await event({ capacity: 5 });
    const other = await event({ capacity: 5 });

    const charset = await rawPurchase(app, e.id, { contentType: 'application/json; charset=utf-8' });
    expect(charset.statusCode).toBe(202);
    expect(charset.body).toMatch(PURCHASE_ACCEPTED);

    const extras = await rawPurchase(app, e.id, {
      payload: JSON.stringify({
        buyerEmail: 'ana@example.com',
        cardNumber: '4000000000000003',
        quantity: 3,
        eventId: other.id,
        channel: 'vitrine',
        status: 'confirmed',
        buyerUserId: 'usr_0000000000000000',
      }),
    });
    expect(extras.statusCode).toBe(202);
    const id = PURCHASE_ACCEPTED.exec(extras.body)?.[1];
    const { rows } = await db.query('SELECT event_id, channel, buyer_user_id, status FROM tickets WHERE id = $1', [id]);
    expect(rows).toEqual([{ event_id: e.id, channel: 'api', buyer_user_id: null, status: 'pending' }]);
    expect(await occupiedAndTotal(db, other.id)).toEqual({ occupied: 0, total: 0 });
  });

  it('F07-CA03 corpo inválido responde 422 invalid_request sem criar ingresso', async () => {
    const { app, db, event } = await setup();
    const e = await event({ capacity: 5 });
    const tickets = await countRows(db, 'tickets');
    const attempts = await countRows(db, 'payment_attempts');
    for (const [label, options] of INVALID_BODIES) {
      const response = await rawPurchase(app, e.id, options);
      expect(response.statusCode, label).toBe(422);
      expect(response.body, label).toBe(INVALID_REQUEST);
      expect(response.headers['content-type'], label).toBe(JSON_TYPE);
    }
    expect(await countRows(db, 'tickets')).toBe(tickets);
    expect(await countRows(db, 'payment_attempts')).toBe(attempts);
  });

  it('F07-CA03 corpo acima de 16 KiB responde 422', async () => {
    const { app, db, event } = await setup();
    const e = await event({ capacity: 5 });
    const payload = JSON.stringify({ buyerEmail: 'ana@example.com', cardNumber: '4000000000000001', padding: 'x'.repeat(20 * 1024) });
    const response = await rawPurchase(app, e.id, { payload });
    expect(response.statusCode).toBe(422);
    expect(response.body).toBe(INVALID_REQUEST);
    expect(await countRows(db, 'tickets')).toBe(0);
  });

  it('F07-CA04 CF10 evento inexistente, em rascunho, cancelado ou com id inválido responde 404 event_not_available', async () => {
    const { app, db, event } = await setup();
    const draft = await event({ status: 'rascunho' });
    const cancelled = await event({ status: 'cancelado' });
    for (const id of ['evt_0000000000000000', draft.id, cancelled.id, 'nao-e-um-evento', draft.id.toUpperCase()]) {
      const response = await rawPurchase(app, id);
      expect(response.statusCode, id).toBe(404);
      expect(response.body, id).toBe(EVENT_NOT_AVAILABLE);
      expect(response.headers['content-type']).toBe(JSON_TYPE);
    }
    expect(await countRows(db, 'tickets')).toBe(0);
    expect(await countRows(db, 'payment_attempts')).toBe(0);
  });

  it('F07-CA04 id de evento com mais de 100 caracteres segue a mesma ordem', async () => {
    const { app, db } = await setup();
    const longId = `evt_${'a'.repeat(146)}`;
    expect(longId).toHaveLength(150);
    const invalid = await rawPurchase(app, longId, { payload: '{"buyerEmail":"ana@example.com","cardNumber":"123"}' });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.body).toBe(INVALID_REQUEST);
    const valid = await rawPurchase(app, longId);
    expect(valid.statusCode).toBe(404);
    expect(valid.body).toBe(EVENT_NOT_AVAILABLE);
    const withoutKey = await rawPurchase(app, longId, { key: null });
    expect(withoutKey.statusCode).toBe(401);
    expect(await countRows(db, 'tickets')).toBe(0);
  });

  it('F07-CA05 sem vaga responde 409 sold_out', async () => {
    const { app, db, event } = await setup();
    const withConfirmed = await event({ capacity: 1 });
    await insertTestTicket(db, { eventId: withConfirmed.id, status: 'confirmed' });
    const withPending = await event({ capacity: 1 });
    await insertTestTicket(db, { eventId: withPending.id, status: 'pending' });
    for (const e of [withConfirmed, withPending]) {
      const response = await rawPurchase(app, e.id);
      expect(response.statusCode).toBe(409);
      expect(response.body).toBe(SOLD_OUT);
      expect(response.headers['content-type']).toBe(JSON_TYPE);
      expect(await occupiedAndTotal(db, e.id)).toEqual({ occupied: 1, total: 1 });
    }
    expect(await countRows(db, 'payment_attempts')).toBe(0);
  });

  it('F07-CA06 a ordem dos erros é 401, 422, 404 e 409', async () => {
    const { app, db, event } = await setup();
    const full = await event({ capacity: 1 });
    await insertTestTicket(db, { eventId: full.id, status: 'pending' });
    const fullThenCancelled = await event({ capacity: 1 });
    await insertTestTicket(db, { eventId: fullThenCancelled.id, status: 'cancelled' });
    await db.query("UPDATE events SET status = 'cancelado', cancelled_at = now() WHERE id = $1", [fullThenCancelled.id]);
    const draft = await event({ capacity: 1, status: 'rascunho' });
    const invalidBodies: RawPurchase[] = [
      { payload: '{"buyerEmail":"ana@example.com","cardNumber":"123"}' },
      { payload: '{"cardNumber":"4000000000000001"}' },
      { payload: '{"buyerEmail":' },
      { contentType: 'text/plain' },
    ];
    for (const id of [full.id, fullThenCancelled.id, draft.id, 'evt_0000000000000000', 'nao-e-um-evento']) {
      for (const options of invalidBodies) {
        const response = await rawPurchase(app, id, options);
        expect(response.statusCode, `${id} ${JSON.stringify(options)}`).toBe(422);
        expect(response.body).toBe(INVALID_REQUEST);
        expect((await rawPurchase(app, id, { ...options, key: 'chave-errada' })).statusCode).toBe(401);
      }
    }
    expect((await rawPurchase(app, fullThenCancelled.id)).body).toBe(EVENT_NOT_AVAILABLE);
    expect((await rawPurchase(app, full.id)).body).toBe(SOLD_OUT);
    expect((await rawPurchase(app, full.id, { key: null })).statusCode).toBe(401);
    expect(await countRows(db, 'tickets')).toBe(2);
  });

  it('a checagem de origem da F02 não se aplica à API', async () => {
    const { app, event } = await setup();
    const e = await event({ capacity: 5 });
    const response = await rawPurchase(app, e.id, {
      headers: { origin: 'https://parceiro.example', 'sec-fetch-site': 'cross-site', referer: 'https://parceiro.example/x' },
    });
    expect(response.statusCode).toBe(202);
    expect(response.body).toMatch(PURCHASE_ACCEPTED);
  });

  it('erro inesperado do serviço responde 500 internal_error em JSON', async () => {
    const { app, event } = await setup({ config: { LOG_LEVEL: 'info' } });
    const e = await event({ capacity: 5 });
    await app.ready();
    const lines = captureLogLines(app);
    vi.spyOn(app.tickets, 'purchase').mockRejectedValue(new Error('falha simulada do banco'));
    const response = await rawPurchase(app, e.id, { payload: BRIEF_BODY });
    expect(response.statusCode).toBe(500);
    expect(response.body).toBe('{"error":"internal_error"}');
    expect(response.headers['content-type']).toBe(JSON_TYPE);
    expect(response.headers['cache-control']).toBe('no-store');
    const logged = parseLogLines(lines).filter((line) => line.msg === 'parceiros: erro inesperado');
    expect(logged).toHaveLength(1);
    expect(logged[0]?.level).toBe(50);
    for (const line of lines) expect(line).not.toContain('4000000000000001');
  });
});
