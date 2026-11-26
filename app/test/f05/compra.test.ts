// Serviço de compra (spec 5.2, 5.3): sucesso, recusas tipadas e sua ordem, preço, comprador e falhas.
import { describe, expect, it } from 'vitest';
import { withTransaction } from '../../src/db/transaction.js';
import { lockEventForUpdate } from '../../src/features/eventos/public.js';
import type { GatewaySimulado } from '../../src/features/gateway/public.js';
import { createTicketService, getSeatAvailability, type PurchaseInput } from '../../src/features/ingressos/public.js';
import { createTestApp } from '../helpers/app.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { eventFields, postForm } from '../f04/support.js';
import { captureLog, CARD_OK, countRows, occupiedAndTotal, sleep } from './support.js';

async function setup() {
  const test = await createTestApp();
  const accounts = await seedAccounts();
  const event = (capacity = 5, status: 'rascunho' | 'publicado' | 'cancelado' = 'publicado', priceCents = 10000) =>
    insertTestEvent(test.db, { organizerId: accounts.organizadorA.id, capacity, status, priceCents });
  return { ...test, ...accounts, event };
}

function api(eventId: string, cardNumber = CARD_OK, email = 'ana@example.com'): PurchaseInput {
  return { eventId, buyer: { type: 'email', email }, cardNumber, channel: 'api' };
}

describe('F05 compra', () => {
  it('F05-CA01 compra com cartão 0001 responde em menos de 1 s com pending, id tkt_ e código, sem esperar o gateway', async () => {
    const { app, db, event } = await setup();
    const e = await event();
    const start = performance.now();
    const result = await app.tickets.purchase(api(e.id));
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { ticket } = result;
    expect(ticket).toMatchObject({
      eventId: e.id,
      status: 'pending',
      checkedIn: false,
      checkedInAt: null,
      pricePaidCents: 10000,
      channel: 'api',
      buyerUserId: null,
      buyerEmail: 'ana@example.com',
    });
    expect(ticket.id).toMatch(/^tkt_[a-z0-9]{16}$/);
    expect(ticket.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(ticket.createdAt.getTime()).toBe(ticket.statusChangedAt.getTime());
    const { rows } = await db.query<{ origin: string; card_last4: string; pendente: boolean }>(
      'SELECT origin, card_last4, delivered_at IS NULL AS pendente FROM payment_attempts WHERE reference = $1',
      [ticket.id],
    );
    expect(rows).toEqual([{ origin: 'compra', card_last4: '0001', pendente: true }]);
  });

  it('ingresso e tentativa de pagamento nascem na mesma transação', async () => {
    const { app, db, event } = await setup();
    const e = await event();
    const seenOutside: { tickets: number; attempts: number }[] = [];
    const gateway: Pick<GatewaySimulado, 'solicitarAutorizacao'> = {
      async solicitarAutorizacao(pedido, opcoes) {
        const registered = await app.gateway.solicitarAutorizacao(pedido, opcoes);
        // Outra conexão, com a transação da compra ainda aberta: não vê nem o ingresso nem a tentativa.
        await sleep(50);
        seenOutside.push({ tickets: await countRows(db, 'tickets'), attempts: await countRows(db, 'payment_attempts') });
        return registered;
      },
    };
    const service = createTicketService({ db, gateway, log: captureLog().log });
    const result = await service.purchase(api(e.id));
    expect(result.ok).toBe(true);
    expect(seenOutside).toEqual([{ tickets: 0, attempts: 0 }]);
    if (!result.ok) return;
    const { rows } = await db.query<{ reference: string; origin: string; card_last4: string }>(
      'SELECT reference, origin, card_last4 FROM payment_attempts',
    );
    expect(rows).toEqual([{ reference: result.ticket.id, origin: 'compra', card_last4: '0001' }]);
  });

  it('F05-CA03 cartão com 15, 17 dígitos ou não numérico é invalid_request e nada é gravado', async () => {
    const { app, db, event } = await setup();
    const e = await event();
    const cards: unknown[] = [
      '400000000000001',
      '40000000000000011',
      '400000000000000A',
      '4000 0000 0000 0001',
      '4000-0000-0000-0001',
      '',
      4000000000000001,
      undefined,
    ];
    for (const card of cards) {
      const result = await app.tickets.purchase({ ...api(e.id), cardNumber: card as string });
      expect(result, String(card)).toEqual({ ok: false, reason: 'invalid_request', field: 'cardNumber' });
    }
    expect(await countRows(db, 'tickets')).toBe(0);
    expect(await countRows(db, 'payment_attempts')).toBe(0);
  });

  it('F05-CA03 invalid_request vem antes de event_not_available e de sold_out', async () => {
    const { app, db, event } = await setup();
    const draft = await event(5, 'rascunho');
    const cancelled = await event(5, 'cancelado');
    const full = await event(1);
    await insertTestTicket(db, { eventId: full.id, status: 'confirmed' });
    for (const eventId of [draft.id, 'evt_0000000000000000', 'nao-e-um-evento', cancelled.id, full.id]) {
      expect(await app.tickets.purchase(api(eventId, '123')), eventId).toEqual({
        ok: false,
        reason: 'invalid_request',
        field: 'cardNumber',
      });
      expect(await app.tickets.purchase(api(eventId, CARD_OK, 'nao-e-um-email')), eventId).toEqual({
        ok: false,
        reason: 'invalid_request',
        field: 'buyer',
      });
    }
    expect(await countRows(db, 'tickets')).toBe(1);
    expect(await countRows(db, 'payment_attempts')).toBe(0);
  });

  it('comprador e canal inválidos são invalid_request', async () => {
    const { app, db, event, participante, organizadorA } = await setup();
    const e = await event();
    const cases: [unknown, string][] = [
      [api(e.id, CARD_OK, 'nao-e-um-email'), 'buyer'],
      [api(e.id, CARD_OK, 'a b@c.d'), 'buyer'],
      [{ eventId: e.id, buyer: { type: 'account', userId: 'usr_0000000000000000' }, cardNumber: CARD_OK, channel: 'vitrine' }, 'buyer'],
      [{ eventId: e.id, buyer: { type: 'account', userId: organizadorA.id }, cardNumber: CARD_OK, channel: 'vitrine' }, 'buyer'],
      [{ eventId: e.id, buyer: { type: 'account', userId: 42 }, cardNumber: CARD_OK, channel: 'vitrine' }, 'buyer'],
      [{ eventId: e.id, buyer: { type: 'email', email: 'ana@example.com' }, cardNumber: CARD_OK, channel: 'vitrine' }, 'channel'],
      [{ eventId: e.id, buyer: { type: 'account', userId: participante.id }, cardNumber: CARD_OK, channel: 'api' }, 'channel'],
      [{ eventId: e.id, buyer: { type: 'email', email: 'ana@example.com' }, cardNumber: CARD_OK, channel: 'site' }, 'channel'],
      [{ eventId: e.id, cardNumber: CARD_OK, channel: 'api' }, 'buyer'],
      [{ eventId: e.id, buyer: { type: 'pix' }, cardNumber: CARD_OK, channel: 'api' }, 'buyer'],
    ];
    for (const [input, field] of cases) {
      expect(await app.tickets.purchase(input as PurchaseInput), JSON.stringify(input)).toEqual({
        ok: false,
        reason: 'invalid_request',
        field,
      });
    }
    expect(await countRows(db, 'tickets')).toBe(0);
    expect(await countRows(db, 'payment_attempts')).toBe(0);
  });

  it('F05-CA04 evento sem vaga recusa como sold_out sem criar ingresso', async () => {
    const { app, db, event } = await setup();
    const withPending = await event(1);
    expect((await app.tickets.purchase(api(withPending.id, '4000000000000003'))).ok).toBe(true);
    expect(await app.tickets.purchase(api(withPending.id))).toEqual({ ok: false, reason: 'sold_out' });
    expect(await occupiedAndTotal(db, withPending.id)).toEqual({ occupied: 1, total: 1 });

    const withConfirmed = await event(1);
    await insertTestTicket(db, { eventId: withConfirmed.id, status: 'confirmed' });
    expect(await app.tickets.purchase(api(withConfirmed.id))).toEqual({ ok: false, reason: 'sold_out' });
    expect(await occupiedAndTotal(db, withConfirmed.id)).toEqual({ occupied: 1, total: 1 });
    expect(await countRows(db, 'payment_attempts')).toBe(1);
  });

  it('F05-CA02 pending ocupa vaga; declined, cancelled e refunded não', async () => {
    const { app, db, event } = await setup();
    const e = await event(2);
    expect((await app.tickets.purchase(api(e.id, '4000000000000004'))).ok).toBe(true);
    expect(await getSeatAvailability(db, e.id)).toEqual({
      eventId: e.id,
      eventStatus: 'publicado',
      capacity: 2,
      occupied: 1,
      available: 1,
    });
    for (const status of ['declined', 'cancelled', 'refunded'] as const) {
      await insertTestTicket(db, { eventId: e.id, status });
    }
    expect((await getSeatAvailability(db, e.id))?.available).toBe(1);
    expect((await app.tickets.purchase(api(e.id))).ok).toBe(true);
    expect(await app.tickets.purchase(api(e.id))).toEqual({ ok: false, reason: 'sold_out' });
    expect((await getSeatAvailability(db, e.id))?.available).toBe(0);
  });

  it('F05-CA07 CF05 a compra grava o preço vigente: 10000, 10000 e 15000 depois da mudança de preço', async () => {
    const { app, db, event } = await setup();
    const e = await event(5, 'publicado', 10000);
    expect((await app.tickets.purchase(api(e.id))).ok).toBe(true);
    expect((await app.tickets.purchase(api(e.id))).ok).toBe(true);
    const cookie = await loginAs(app, 'organizador.a@catraca.test');
    const edit = await postForm(
      app,
      `/organizador/eventos/${e.id}/editar`,
      { ...eventFields({ nome: e.name, local: e.location, lotacao: '5', preco: '150,00' }) },
      cookie,
    );
    expect(edit.statusCode).toBe(302);
    expect(edit.headers.location).toBe(`/organizador/eventos/${e.id}?ok=atualizado`);
    const third = await app.tickets.purchase(api(e.id));
    expect(third.ok && third.ticket.pricePaidCents).toBe(15000);
    const { rows } = await db.query<{ price_paid_cents: number }>(
      'SELECT price_paid_cents FROM tickets WHERE event_id = $1 ORDER BY created_at, id',
      [e.id],
    );
    expect(rows.map((row) => row.price_paid_cents)).toEqual([10000, 10000, 15000]);
  });

  it('F05-CA09 evento cancelado recusa como event_not_available e tem 0 vagas', async () => {
    const { app, db, event } = await setup();
    const e = await event(3, 'cancelado');
    expect(await app.tickets.purchase(api(e.id))).toEqual({ ok: false, reason: 'event_not_available' });
    expect(await getSeatAvailability(db, e.id)).toEqual({
      eventId: e.id,
      eventStatus: 'cancelado',
      capacity: 3,
      occupied: 0,
      available: 0,
    });
    expect(await countRows(db, 'tickets')).toBe(0);
  });

  it('F05-CA10 CF05 evento em rascunho, inexistente ou com id inválido recusa como event_not_available', async () => {
    const { app, db, event } = await setup();
    const draft = await event(5, 'rascunho');
    for (const eventId of [draft.id, 'evt_0000000000000000', 'nao-e-um-evento', '', 'EVT_0000000000000000']) {
      expect(await app.tickets.purchase(api(eventId)), eventId).toEqual({ ok: false, reason: 'event_not_available' });
    }
    expect(await countRows(db, 'tickets')).toBe(0);
    expect(await countRows(db, 'payment_attempts')).toBe(0);
    expect(await getSeatAvailability(db, draft.id)).toMatchObject({ eventStatus: 'rascunho', available: 5 });
  });

  it('vitrine grava a conta e o e-mail da conta em minúsculas; API grava só o e-mail normalizado', async () => {
    const { app, db, event, participante } = await setup();
    const e = await event();
    await db.query("UPDATE users SET email = 'Participante@Catraca.test' WHERE id = $1", [participante.id]);
    const vitrine = await app.tickets.purchase({
      eventId: e.id,
      buyer: { type: 'account', userId: participante.id },
      cardNumber: CARD_OK,
      channel: 'vitrine',
    });
    expect(vitrine.ok && vitrine.ticket).toMatchObject({
      channel: 'vitrine',
      buyerUserId: participante.id,
      buyerEmail: 'participante@catraca.test',
    });
    const viaApi = await app.tickets.purchase(api(e.id, CARD_OK, ' Ana@Example.com '));
    expect(viaApi.ok && viaApi.ticket).toMatchObject({ channel: 'api', buyerUserId: null, buyerEmail: 'ana@example.com' });
  });

  it('falha ao registrar a tentativa de pagamento desfaz a compra inteira', async () => {
    const { app, db, event } = await setup();
    const e = await event();
    const failing = createTicketService({
      db,
      gateway: {
        async solicitarAutorizacao() {
          throw new Error('gateway fora do ar');
        },
      },
      log: captureLog().log,
    });
    await expect(failing.purchase(api(e.id))).rejects.toThrow('gateway fora do ar');
    const failingAfterInsert = createTicketService({
      db,
      gateway: {
        async solicitarAutorizacao(pedido, opcoes) {
          await app.gateway.solicitarAutorizacao(pedido, opcoes);
          throw new Error('falha depois de gravar a tentativa');
        },
      },
      log: captureLog().log,
    });
    await expect(failingAfterInsert.purchase(api(e.id))).rejects.toThrow('falha depois de gravar a tentativa');
    expect(await countRows(db, 'tickets')).toBe(0);
    expect(await countRows(db, 'payment_attempts')).toBe(0);
  });

  it('colisão de código gera outro código; cinco colisões desfazem a compra', async () => {
    const { app, db, event } = await setup();
    const e = await event();
    const existing = await insertTestTicket(db, { eventId: e.id, code: 'K7Q2M9XA', status: 'declined' });
    const codes = ['K7Q2M9XA', 'K7Q2M9XA', 'NOVO0001'];
    const capture = captureLog();
    const service = createTicketService({ db, gateway: app.gateway, log: capture.log, generateCode: () => codes.shift() ?? 'NOVO0002' });
    const result = await service.purchase(api(e.id));
    expect(result.ok && result.ticket.code).toBe('NOVO0001');
    const warnings = capture.entries.filter((entry) => entry.msg === 'ingressos: código repetido, gerando outro');
    expect(warnings.map((entry) => [entry.level, entry.data.tentativa])).toEqual([
      ['warn', 2],
      ['warn', 3],
    ]);

    const always = createTicketService({ db, gateway: app.gateway, log: captureLog().log, generateCode: () => existing.code });
    await expect(always.purchase(api(e.id))).rejects.toThrow('ingressos: não foi possível gerar um código único');
    expect(await countRows(db, 'tickets')).toBe(2);
    expect(await countRows(db, 'payment_attempts')).toBe(1);
  });

  it('a transação da compra desiste depois de 5 s esperando a trava', async () => {
    const { app, db, event } = await setup();
    const e = await event();
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => {};
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const holder = withTransaction(testDb(), async (client) => {
      await lockEventForUpdate(client, e.id);
      locked();
      await released;
    });
    await isLocked;
    const start = performance.now();
    const error = await app.tickets.purchase(api(e.id)).then(
      () => null,
      (caught: unknown) => caught as { code?: string },
    );
    const elapsed = performance.now() - start;
    setTimeout(release, 1000);
    await holder;
    expect(error?.code).toBe('55P03');
    expect(elapsed).toBeGreaterThanOrEqual(4900);
    expect(elapsed).toBeLessThan(6500);
    expect(await countRows(db, 'tickets')).toBe(0);
    expect(await countRows(db, 'payment_attempts')).toBe(0);
  });
});
