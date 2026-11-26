// "Meus ingressos" GET /meus-ingressos (spec 5.5): só os ingressos da vitrine da conta logada, do
// mais recente para o mais antigo, com nome e data do evento, rótulo do status e código.
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { insertTestTicket, settlePayments } from '../helpers/tickets.js';
import { PROX } from '../f04/support.js';
import { CARD_OK, SUCCESS_MESSAGE, get, postPurchase, productDate, signupParticipant, ticketRows } from './support.js';

describe('F06 Meus ingressos', () => {
  it('F06-CA02 o ingresso aparece pendente com nome do evento e código e, depois da aprovação, confirmado', async () => {
    const { app, db } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id, name: 'Show do Fluxo', startsAt: productDate(PROX) });
    const buyer = await signupParticipant(app);

    const purchase = await postPurchase(app, buyer.cookie, event.id, CARD_OK);
    expect(purchase.headers.location).toBe('/meus-ingressos?ok=compra');
    const { rows } = await db.query<{ id: string; code: string }>('SELECT id, code FROM tickets WHERE event_id = $1', [event.id]);
    const ticket = rows[0];
    expect(ticket?.code).toMatch(/^[A-Z0-9]{8}$/);

    const after = await get(app, '/meus-ingressos?ok=compra', buyer.cookie);
    expect(after.statusCode).toBe(200);
    expect(after.body).toContain('<title>Meus ingressos · Catraca</title>');
    expect(after.body).toContain(`<main>\n${SUCCESS_MESSAGE('Compra registrada')}\n<h1>Meus ingressos</h1>\n<table>\n`);
    expect(ticketRows(after.body)).toEqual([
      { event: 'Show do Fluxo', date: PROX.br, status: 'pending', label: 'pendente', code: ticket?.code },
    ]);

    await settlePayments(app);
    const reloaded = await get(app, '/meus-ingressos', buyer.cookie);
    expect(ticketRows(reloaded.body)).toEqual([
      { event: 'Show do Fluxo', date: PROX.br, status: 'confirmed', label: 'confirmado', code: ticket?.code },
    ]);
    expect(reloaded.body).not.toContain('Compra registrada');
  });

  it('F06-CA06 mostra só os ingressos da vitrine da conta logada', async () => {
    const { app } = await createTestApp();
    const { organizadorA, participante } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });
    const x = await signupParticipant(app);
    const y = await signupParticipant(app);

    expect((await postPurchase(app, x.cookie, event.id, CARD_OK)).statusCode).toBe(302);
    expect((await postPurchase(app, y.cookie, event.id, CARD_OK)).statusCode).toBe(302);
    const viaApi = await app.tickets.purchase({ eventId: event.id, buyer: { type: 'email', email: x.email }, cardNumber: CARD_OK, channel: 'api' });
    const seed = await app.tickets.purchase({
      eventId: event.id,
      buyer: { type: 'account', userId: participante.id },
      cardNumber: CARD_OK,
      channel: 'vitrine',
    });
    if (!viaApi.ok || !seed.ok) throw new Error('compras de apoio recusadas');

    const { rows } = await testDb().query<{ code: string; buyer_user_id: string | null }>(
      'SELECT code, buyer_user_id FROM tickets WHERE event_id = $1',
      [event.id],
    );
    const codeOfUser = (userId: string): string => rows.find((row) => row.buyer_user_id === userId)?.code ?? '';
    const [cx, cy] = [codeOfUser(x.userId), codeOfUser(y.userId)];

    const pageX = await get(app, '/meus-ingressos', x.cookie);
    expect(ticketRows(pageX.body).map((row) => row.code)).toEqual([cx]);
    for (const other of [cy, viaApi.ticket.code, seed.ticket.code]) expect(pageX.body).not.toContain(other);

    const pageY = await get(app, '/meus-ingressos', y.cookie);
    expect(ticketRows(pageY.body).map((row) => row.code)).toEqual([cy]);
    for (const other of [cx, viaApi.ticket.code, seed.ticket.code]) expect(pageY.body).not.toContain(other);
  });

  it('ingressos do mais recente para o mais antigo', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const events = [
      await insertTestEvent(testDb(), { organizerId: organizadorA.id, name: 'Primeiro' }),
      await insertTestEvent(testDb(), { organizerId: organizadorA.id, name: 'Segundo' }),
      await insertTestEvent(testDb(), { organizerId: organizadorA.id, name: 'Terceiro' }),
    ];
    const buyer = await signupParticipant(app);
    for (const event of events) expect((await postPurchase(app, buyer.cookie, event.id, CARD_OK)).statusCode).toBe(302);

    const { body } = await get(app, '/meus-ingressos', buyer.cookie);
    expect(ticketRows(body).map((row) => row.event)).toEqual(['Terceiro', 'Segundo', 'Primeiro']);
  });

  it('rótulos pendente, confirmado, recusado, cancelado e estornado; evento cancelado continua com o nome', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const published = await insertTestEvent(testDb(), { organizerId: organizadorA.id, name: 'Publicado <A>', startsAt: productDate(PROX) });
    const cancelled = await insertTestEvent(testDb(), {
      organizerId: organizadorA.id,
      name: 'Cancelado & Lembrado',
      status: 'cancelado',
      startsAt: productDate(PROX),
    });
    const buyer = await signupParticipant(app);
    const base = Date.now() - 60_000;
    const plan = [
      { eventId: cancelled.id, status: 'refunded' as const },
      { eventId: cancelled.id, status: 'cancelled' as const },
      { eventId: published.id, status: 'declined' as const },
      { eventId: published.id, status: 'confirmed' as const },
      { eventId: published.id, status: 'pending' as const },
    ];
    const tickets = [];
    for (const [i, item] of plan.entries()) {
      tickets.push(await insertTestTicket(testDb(), { ...item, buyerUserId: buyer.userId, createdAt: new Date(base + i * 1000) }));
    }

    const { body } = await get(app, '/meus-ingressos', buyer.cookie);
    expect(ticketRows(body)).toEqual([
      { event: 'Publicado &lt;A&gt;', date: PROX.br, status: 'pending', label: 'pendente', code: tickets[4]?.code },
      { event: 'Publicado &lt;A&gt;', date: PROX.br, status: 'confirmed', label: 'confirmado', code: tickets[3]?.code },
      { event: 'Publicado &lt;A&gt;', date: PROX.br, status: 'declined', label: 'recusado', code: tickets[2]?.code },
      { event: 'Cancelado &amp; Lembrado', date: PROX.br, status: 'cancelled', label: 'cancelado', code: tickets[1]?.code },
      { event: 'Cancelado &amp; Lembrado', date: PROX.br, status: 'refunded', label: 'estornado', code: tickets[0]?.code },
    ]);
  });

  it('Compra registrada só aparece com ok=compra', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const buyer = await signupParticipant(app);
    for (const query of ['', '?ok=outra', '?ok=compra&ok=compra', '?ok=Compra', '?okk=compra']) {
      const response = await get(app, `/meus-ingressos${query}`, buyer.cookie);
      expect(response.statusCode, query).toBe(200);
      expect(response.body, query).not.toContain('Compra registrada');
    }
    const ok = await get(app, '/meus-ingressos?ok=compra', buyer.cookie);
    expect(ok.body.split(SUCCESS_MESSAGE('Compra registrada'))).toHaveLength(2);
  });

  it('sem ingressos mostra Você ainda não tem ingressos.', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });
    // Compra pela API com o e-mail da conta não conta como ingresso da conta.
    const buyer = await signupParticipant(app);
    await insertTestTicket(testDb(), { eventId: event.id, buyerEmail: buyer.email, channel: 'api' });
    const response = await get(app, '/meus-ingressos', buyer.cookie);
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<h1>Meus ingressos</h1>\n<p>Você ainda não tem ingressos.</p>');
    expect(response.body).not.toContain('<table>');
  });

  it('visitante vai para /entrar?voltar=%2Fmeus-ingressos e organizador recebe 403', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const visitor = await get(app, '/meus-ingressos');
    expect(visitor.statusCode).toBe(302);
    expect(visitor.headers.location).toBe('/entrar?voltar=%2Fmeus-ingressos');
    const withQuery = await get(app, '/meus-ingressos?ok=compra');
    expect(withQuery.headers.location).toBe('/entrar?voltar=%2Fmeus-ingressos%3Fok%3Dcompra');

    const organizer = await loginAs(app, 'organizador.a@catraca.test');
    const forbidden = await get(app, '/meus-ingressos', organizer);
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.body).toContain('<h1>Acesso negado</h1><p>Esta página é exclusiva para participantes.</p>');
  });
});
