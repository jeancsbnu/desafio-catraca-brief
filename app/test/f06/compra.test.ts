// Compra pela vitrine POST /eventos/:id/comprar (spec 5.4): guarda da F02, evento à venda (F04),
// serviço de compra da F05 pelo canal vitrine e a tradução de cada resultado em página e status.
import { describe, expect, it, vi } from 'vitest';
import { purchaseOutcome, readCardNumber } from '../../src/features/vitrine/purchase.js';
import { createTestApp } from '../helpers/app.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { postForm } from '../f04/support.js';
import {
  CARD_OK,
  ERROR_MESSAGE,
  ORGANIZER_BLOCK,
  SOLD_OUT_BLOCK,
  SUCCESS_MESSAGE,
  countPaymentAttempts,
  countTickets,
  formBlock,
  get,
  postPurchase,
  purchaseBlock,
  signupParticipant,
  ticketRows,
} from './support.js';

const CLEAR_COOKIE = 'catraca_sessao=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax';

describe('F06 compra pela vitrine', () => {
  it('F06-CA02 compra com 4000000000000001 leva a /meus-ingressos com Compra registrada', async () => {
    const { app, db } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id, capacity: 2, priceCents: 4550 });
    const buyer = await signupParticipant(app, { email: 'Compradora.F06@Example.com' });

    const response = await postPurchase(app, buyer.cookie, event.id, CARD_OK);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/meus-ingressos?ok=compra');
    expect(response.headers['set-cookie']).toBeUndefined();

    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT t.status, t.channel, t.buyer_user_id, t.buyer_email, t.price_paid_cents, p.card_last4
         FROM tickets t JOIN payment_attempts p ON p.origin = 'compra' AND p.reference = t.id
        WHERE t.event_id = $1`,
      [event.id],
    );
    expect(rows).toEqual([
      {
        status: 'pending',
        channel: 'vitrine',
        buyer_user_id: buyer.userId,
        buyer_email: 'compradora.f06@example.com',
        price_paid_cents: 4550,
        card_last4: '0001',
      },
    ]);

    const next = await get(app, String(response.headers.location), buyer.cookie);
    expect(next.statusCode).toBe(200);
    expect(next.body).toContain(SUCCESS_MESSAGE('Compra registrada'));
    expect(ticketRows(next.body).map((row) => row.label)).toEqual(['pendente']);
  });

  it('espaços digitados no número do cartão são removidos antes da compra', async () => {
    const { app, db } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id, capacity: 5 });
    const { cookie } = await signupParticipant(app);

    for (const cartao of ['4000 0000 0000 0001', ' 4000000000000001 ', '4000\t0000\n0000  0001']) {
      const response = await postPurchase(app, cookie, event.id, cartao);
      expect(response.statusCode, JSON.stringify(cartao)).toBe(302);
      expect(response.headers.location).toBe('/meus-ingressos?ok=compra');
    }
    const { rows } = await db.query<{ card_last4: string; channel: string }>(
      `SELECT p.card_last4, t.channel FROM tickets t JOIN payment_attempts p ON p.origin = 'compra' AND p.reference = t.id
        WHERE t.event_id = $1`,
      [event.id],
    );
    expect(rows).toEqual([
      { card_last4: '0001', channel: 'vitrine' },
      { card_last4: '0001', channel: 'vitrine' },
      { card_last4: '0001', channel: 'vitrine' },
    ]);
  });

  it('F06-CA04 cartão com menos de 16 dígitos mostra Número de cartão inválido e não cria ingresso', async () => {
    const { app, db } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id, capacity: 5 });
    const { cookie } = await signupParticipant(app);
    const attempts = await countPaymentAttempts(db);

    const cases: (string | undefined)[] = ['400000000000001', '40000000000000011', '400000000000000A', '4000-0000-0000-0001', '', undefined];
    for (const cartao of cases) {
      const response = await postPurchase(app, cookie, event.id, cartao);
      const label = JSON.stringify(cartao ?? null);
      expect(response.statusCode, label).toBe(422);
      expect(response.body.split('Número de cartão inválido'), label).toHaveLength(2);
      expect(response.body, label).toContain(`<main>\n${ERROR_MESSAGE('Número de cartão inválido')}\n<h1>`);
      expect(purchaseBlock(response.body), label).toEqual({ kind: 'formulario', html: formBlock(event.id) });
      if (cartao !== undefined && cartao !== '') expect(response.body, label).not.toContain(cartao);
    }

    // Campo repetido e POST sem corpo também contam como cartão vazio.
    const repeated = await postForm(app, `/eventos/${event.id}/comprar`, new URLSearchParams([['cartao', CARD_OK], ['cartao', CARD_OK]]), cookie);
    expect(repeated.statusCode).toBe(422);
    expect(repeated.body).not.toContain(CARD_OK);
    const empty = await app.inject({ method: 'POST', url: `/eventos/${event.id}/comprar`, headers: { cookie } });
    expect(empty.statusCode).toBe(422);
    expect(empty.body).toContain(ERROR_MESSAGE('Número de cartão inválido'));

    expect(await countTickets(db, event.id)).toBe(0);
    expect(await countPaymentAttempts(db)).toBe(attempts);
  });

  it('F06-CA03 compra enviada depois de as vagas acabarem mostra Ingressos esgotados e não cria ingresso', async () => {
    const { app, db } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id, capacity: 1 });
    const buyer = await signupParticipant(app);

    const page = await get(app, `/eventos/${event.id}`, buyer.cookie);
    expect(purchaseBlock(page.body)?.kind).toBe('formulario');

    const other = await app.tickets.purchase({
      eventId: event.id,
      buyer: { type: 'email', email: 'terceiro@example.com' },
      cardNumber: CARD_OK,
      channel: 'api',
    });
    expect(other.ok).toBe(true);

    const response = await postPurchase(app, buyer.cookie, event.id, CARD_OK);
    expect(response.statusCode).toBe(409);
    expect(response.body).toContain(`<main>\n${ERROR_MESSAGE('Ingressos esgotados')}\n<h1>`);
    expect(response.body).toContain('<dt>Vagas disponíveis</dt><dd>0</dd>');
    expect(purchaseBlock(response.body)).toEqual({ kind: 'esgotado', html: SOLD_OUT_BLOCK });
    expect(response.body).not.toContain(`action="/eventos/${event.id}/comprar"`);
    expect(await countTickets(db, event.id)).toBe(1);
  });

  it('evento cancelado ou em rascunho entre abrir a página e comprar responde 404 Evento não encontrado', async () => {
    const { app, db } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const organizer = await loginAs(app, 'organizador.a@catraca.test');
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id, name: 'Show Cancelado no Caminho' });
    const draft = await insertTestEvent(testDb(), { organizerId: organizadorA.id, status: 'rascunho' });
    const buyer = await signupParticipant(app);

    const page = await get(app, `/eventos/${event.id}`, buyer.cookie);
    expect(purchaseBlock(page.body)?.kind).toBe('formulario');
    const cancel = await postForm(app, `/organizador/eventos/${event.id}/cancelar`, { confirmar: 'sim' }, organizer);
    expect(cancel.statusCode).toBe(302);

    const notFound = (await get(app, '/eventos/evt_0000000000000000', buyer.cookie)).body;
    for (const id of [event.id, draft.id, 'evt_0000000000000000', 'nao-e-um-evento']) {
      const response = await postPurchase(app, buyer.cookie, id, CARD_OK);
      expect(response.statusCode, id).toBe(404);
      expect(response.body, id).toBe(notFound);
      expect(response.body).not.toContain('Show Cancelado no Caminho');
    }
    expect(await countTickets(db)).toBe(0);
  });

  it('F06-CA05 organizador que envia a compra recebe 403 com a mensagem e nenhum ingresso', async () => {
    const { app, db } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });
    const attempts = await countPaymentAttempts(db);

    for (const email of ['organizador.a@catraca.test', 'organizador.b@catraca.test']) {
      const cookie = await loginAs(app, email);
      const response = await postPurchase(app, cookie, event.id, CARD_OK);
      expect(response.statusCode).toBe(403);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(purchaseBlock(response.body)).toEqual({ kind: 'organizador', html: ORGANIZER_BLOCK });
      expect(response.body).not.toContain('Acesso negado');
      expect(response.body).not.toContain('class="msg msg-error"');
    }
    expect(await countTickets(db)).toBe(0);
    expect(await countPaymentAttempts(db)).toBe(attempts);
  });

  it('CF07 visitante ou sessão expirada no envio vai para /entrar com volta ao evento, sem criar ingresso', async () => {
    const { app, db } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });
    const expected = `/entrar?voltar=%2Feventos%2F${event.id}`;

    const anonymous = await postPurchase(app, null, event.id, CARD_OK);
    expect(anonymous.statusCode).toBe(302);
    expect(anonymous.headers.location).toBe(expected);
    expect(anonymous.headers['set-cookie']).toBeUndefined();

    const tampered = await postPurchase(app, 'catraca_sessao=adulterado.adulterado', event.id, CARD_OK);
    expect(tampered.statusCode).toBe(302);
    expect(tampered.headers.location).toBe(expected);
    expect(tampered.headers['set-cookie']).toBe(CLEAR_COOKIE);

    const buyer = await signupParticipant(app);
    await db.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1", [buyer.userId]);
    const expired = await postPurchase(app, buyer.cookie, event.id, CARD_OK);
    expect(expired.statusCode).toBe(302);
    expect(expired.headers.location).toBe(expected);

    // Evento indisponível também volta ao login (a sessão é conferida antes do evento).
    const draft = await postPurchase(app, null, 'nao-e-um-evento', CARD_OK);
    expect(draft.headers.location).toBe('/entrar?voltar=%2Feventos%2Fnao-e-um-evento');

    expect(await countTickets(db)).toBe(0);
  });

  it('compra de outra origem é bloqueada pela F02 sem criar ingresso', async () => {
    const { app, db } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });
    const { cookie } = await signupParticipant(app);
    const response = await postPurchase(app, cookie, event.id, CARD_OK, { origin: 'http://evil.example' });
    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('<h1>Requisição bloqueada</h1>');
    expect(await countTickets(db)).toBe(0);
  });

  it('erro do serviço de compra responde 500 sem gravar ingresso', async () => {
    const { app, db } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });
    const { cookie } = await signupParticipant(app);
    const spy = vi.spyOn(app.tickets, 'purchase').mockRejectedValue(new Error('falha simulada'));
    try {
      const response = await postPurchase(app, cookie, event.id, CARD_OK);
      expect(response.statusCode).toBe(500);
      expect(response.body).toContain('<h1>Algo deu errado. Tente novamente.</h1>');
      expect(spy).toHaveBeenCalledWith({
        eventId: event.id,
        buyer: { type: 'account', userId: expect.stringMatching(/^usr_/) as unknown },
        cardNumber: CARD_OK,
        channel: 'vitrine',
      });
    } finally {
      spy.mockRestore();
    }
    expect(await countTickets(db)).toBe(0);
  });

  it('leitura do cartão e tradução do resultado do serviço', async () => {
    expect(readCardNumber({ cartao: ' 4000 0000\t0000 0001\n' })).toBe(CARD_OK);
    expect(readCardNumber({ cartao: '4000-0000-0000-0001' })).toBe('4000-0000-0000-0001');
    expect(readCardNumber({ cartao: [CARD_OK, CARD_OK] })).toBe('');
    expect(readCardNumber({})).toBe('');
    expect(readCardNumber(undefined)).toBe('');
    expect(readCardNumber(Object.create({ cartao: CARD_OK }))).toBe('');

    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });
    const ticket = await insertTestTicket(testDb(), { eventId: event.id });
    expect(purchaseOutcome({ ok: true, ticket })).toEqual({ kind: 'registered' });
    expect(purchaseOutcome({ ok: false, reason: 'sold_out' })).toEqual({ kind: 'event-page', status: 409, message: 'Ingressos esgotados' });
    expect(purchaseOutcome({ ok: false, reason: 'invalid_request', field: 'cardNumber' })).toEqual({
      kind: 'event-page',
      status: 422,
      message: 'Número de cartão inválido',
    });
    expect(purchaseOutcome({ ok: false, reason: 'event_not_available' })).toEqual({ kind: 'not-found' });
    expect(() => purchaseOutcome({ ok: false, reason: 'invalid_request', field: 'buyer' })).toThrow(
      'vitrine: comprador recusado pelo serviço de compra',
    );
  });
});
