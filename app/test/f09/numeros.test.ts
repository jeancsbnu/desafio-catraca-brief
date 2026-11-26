// Definições de R12 com compras reais (serviço da F05), resultados do gateway, edição e
// cancelamento pela página de gestão (F04); números lidos da página pelo mesmo leitor do contrato.
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/pool.js';
import type { TicketChannel, TicketRecord, TicketStatus } from '../../src/features/ingressos/public.js';
import { insertTestEvent } from '../helpers/events.js';
import { insertTestTicket, settlePayments } from '../helpers/tickets.js';
import { createViaHttp, eventFields, postEmpty, postForm } from '../f04/support.js';
import { CARD_OK, CARD_SLOW_DECLINED, CARD_SLOW_OK, panelLine, panelOf, setup } from './support.js';

async function buy(app: FastifyInstance, eventId: string, cardNumber: string, email: string): Promise<TicketRecord> {
  const result = await app.tickets.purchase({ eventId, buyer: { type: 'email', email }, cardNumber, channel: 'api' });
  if (!result.ok) throw new Error(`compra recusada: ${result.reason}`);
  return result.ticket;
}

async function publishedViaHttp(app: FastifyInstance, cookie: string, lotacao: string, preco: string): Promise<string> {
  const id = await createViaHttp(app, cookie, { lotacao, preco });
  const published = await postEmpty(app, `/organizador/eventos/${id}/publicar`, cookie);
  expect(published.statusCode).toBe(302);
  return id;
}

async function cancelViaHttp(app: FastifyInstance, cookie: string, eventId: string): Promise<void> {
  const response = await postForm(app, `/organizador/eventos/${eventId}/cancelar`, { confirmar: 'sim' }, cookie);
  expect(response.statusCode).toBe(302);
  expect(response.headers.location).toBe(`/organizador/eventos/${eventId}?ok=cancelado`);
}

async function status(db: Db, ticketId: string): Promise<string | undefined> {
  const { rows } = await db.query<{ status: string }>('SELECT status FROM tickets WHERE id = $1', [ticketId]);
  return rows[0]?.status;
}

describe('F09 números do painel', () => {
  it('F09-CA02 CF16 duas compras confirmadas a R$ 100,00, preço R$ 150,00 e lotação 3 pela página de gestão e uma terceira confirmada mostram 3, 0, 0, 0, R$ 350,00 e 0', async () => {
    const { app, db, cookieA } = await setup();
    const eventId = await publishedViaHttp(app, cookieA, '2', '100,00');
    expect((await panelOf(app, cookieA, eventId)).line).toBe(panelLine(0, 0, 0, 2, 'R$ 0,00', 0));

    await buy(app, eventId, CARD_OK, 't1@example.com');
    await buy(app, eventId, CARD_OK, 't2@example.com');
    expect((await panelOf(app, cookieA, eventId)).line).toBe(panelLine(0, 2, 0, 0, 'R$ 0,00', 0));
    await settlePayments(app);
    expect((await panelOf(app, cookieA, eventId)).line).toBe(panelLine(2, 0, 0, 0, 'R$ 200,00', 0));

    const edited = await postForm(app, `/organizador/eventos/${eventId}/editar`, { ...eventFields({ lotacao: '3', preco: '150,00' }) }, cookieA);
    expect(edited.statusCode).toBe(302);
    expect(edited.headers.location).toBe(`/organizador/eventos/${eventId}?ok=atualizado`);
    expect((await panelOf(app, cookieA, eventId)).line).toBe(panelLine(2, 0, 0, 1, 'R$ 200,00', 0));

    await buy(app, eventId, CARD_OK, 't3@example.com');
    await settlePayments(app);
    const page = await panelOf(app, cookieA, eventId);
    expect(page.line).toBe(panelLine(3, 0, 0, 0, 'R$ 350,00', 0));
    expect(page.revenueCents).toBe(35000);
    const { rows } = await db.query<{ price_paid_cents: number }>(
      'SELECT price_paid_cents FROM tickets WHERE event_id = $1 ORDER BY created_at, id',
      [eventId],
    );
    expect(rows.map((row) => row.price_paid_cents)).toEqual([10000, 10000, 15000]);
  });

  it('CF16 a mudança de preço não altera a Receita das compras anteriores', async () => {
    const { app, db, cookieA } = await setup();
    const eventId = await publishedViaHttp(app, cookieA, '3', '100,00');
    await buy(app, eventId, CARD_OK, 'a@example.com');
    await buy(app, eventId, CARD_OK, 'b@example.com');
    await settlePayments(app);
    const before = await panelOf(app, cookieA, eventId);
    expect(before.line).toBe(panelLine(2, 0, 0, 1, 'R$ 200,00', 0));

    const edited = await postForm(app, `/organizador/eventos/${eventId}/editar`, { ...eventFields({ lotacao: '3', preco: '150,00' }) }, cookieA);
    expect(edited.statusCode).toBe(302);
    const { rows } = await db.query<{ price_cents: number }>('SELECT price_cents FROM events WHERE id = $1', [eventId]);
    expect(rows[0]?.price_cents).toBe(15000);

    const after = await panelOf(app, cookieA, eventId);
    expect(after.line).toBe(panelLine(2, 0, 0, 1, 'R$ 200,00', 0));
    expect(after.revenueCents).toBe(20000);
    expect(after.html).toContain('<dt>Receita</dt><dd data-metrica="receita" data-centavos="20000">R$ 200,00</dd>');
  });

  it('F09-CA03 CF17 compra pendente conta em Pendentes e ocupa vaga; a recusa a tira de todos os números e libera a vaga', async () => {
    const { app, db, cookieA } = await setup();
    const eventId = await publishedViaHttp(app, cookieA, '2', '100,00');
    const confirmed = await buy(app, eventId, CARD_OK, 'ok@example.com');
    await settlePayments(app, { ticketIds: [confirmed.id] });
    const pending = await buy(app, eventId, CARD_SLOW_DECLINED, 'lento@example.com');
    expect(await status(db, pending.id)).toBe('pending');
    expect((await panelOf(app, cookieA, eventId)).line).toBe(panelLine(1, 1, 0, 0, 'R$ 100,00', 0));

    await settlePayments(app);
    expect(await status(db, pending.id)).toBe('declined');
    expect((await panelOf(app, cookieA, eventId)).line).toBe(panelLine(1, 0, 0, 1, 'R$ 100,00', 0));
  });

  it('F09-CA04 CF17 cancelamento com 1 confirmado e 1 pendente mostra 0, 0, 0, 0, R$ 0,00 e Estornados 1', async () => {
    const { app, db, cookieA } = await setup();
    const eventId = await publishedViaHttp(app, cookieA, '5', '50,00');
    const slow = await buy(app, eventId, CARD_SLOW_OK, 't5@example.com');
    const fast = await buy(app, eventId, CARD_OK, 't6@example.com');
    await settlePayments(app, { ticketIds: [fast.id] });
    expect((await panelOf(app, cookieA, eventId)).line).toBe(panelLine(1, 1, 0, 3, 'R$ 50,00', 0));

    await cancelViaHttp(app, cookieA, eventId);
    expect(await status(db, fast.id)).toBe('refunded');
    expect(await status(db, slow.id)).toBe('cancelled');
    const page = await panelOf(app, cookieA, eventId);
    expect(page.line).toBe(panelLine(0, 0, 0, 0, 'R$ 0,00', 1));
    expect(page.revenueCents).toBe(0);
  });

  it('F09-CA04 a resposta do gateway depois do cancelamento não muda o painel', async () => {
    const { app, db, cookieA } = await setup();
    const eventId = await publishedViaHttp(app, cookieA, '5', '50,00');
    const slow = await buy(app, eventId, CARD_SLOW_OK, 't5@example.com');
    const fast = await buy(app, eventId, CARD_OK, 't6@example.com');
    await settlePayments(app, { ticketIds: [fast.id] });
    await cancelViaHttp(app, cookieA, eventId);
    const line = panelLine(0, 0, 0, 0, 'R$ 0,00', 1);
    expect((await panelOf(app, cookieA, eventId)).line).toBe(line);

    // A tentativa do …0003 (aprovado) chega depois do cancelamento: ignorada pela F05.
    expect(await settlePayments(app, { ticketIds: [slow.id] })).toBe(1);
    expect(await status(db, slow.id)).toBe('cancelled');
    expect((await panelOf(app, cookieA, eventId)).line).toBe(line);
  });

  it('CF17 Vagas disponíveis = lotação − Pendentes − Confirmados em misturas de status e canais', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const statuses: TicketStatus[] = ['pending', 'confirmed', 'declined', 'cancelled', 'refunded'];
    const channels: TicketChannel[] = ['vitrine', 'api'];
    const mixes: { capacity: number; tickets: { status: TicketStatus; channel: TicketChannel; checkedIn?: boolean; cents: number }[] }[] = [
      { capacity: 1, tickets: [] },
      { capacity: 3, tickets: [{ status: 'declined', channel: 'api', cents: 500 }, { status: 'cancelled', channel: 'vitrine', cents: 700 }] },
      {
        capacity: 10,
        tickets: [
          { status: 'confirmed', channel: 'vitrine', cents: 1000, checkedIn: true },
          { status: 'confirmed', channel: 'api', cents: 2550 },
          { status: 'pending', channel: 'api', cents: 1000 },
          { status: 'pending', channel: 'vitrine', cents: 1000 },
          { status: 'refunded', channel: 'api', cents: 3000, checkedIn: true },
          { status: 'refunded', channel: 'vitrine', cents: 3000 },
          { status: 'declined', channel: 'vitrine', cents: 9900 },
          { status: 'cancelled', channel: 'api', cents: 9900 },
        ],
      },
      {
        capacity: 4,
        tickets: statuses.flatMap((s, i) => channels.map((channel) => ({ status: s, channel, cents: 1000 + i * 111 }))),
      },
    ];
    for (const [index, mix] of mixes.entries()) {
      const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: mix.capacity, priceCents: 99999 });
      for (const ticket of mix.tickets) {
        await insertTestTicket(db, {
          eventId: event.id,
          status: ticket.status,
          channel: ticket.channel,
          buyerUserId: ticket.channel === 'vitrine' ? accounts.participante.id : undefined,
          pricePaidCents: ticket.cents,
          checkedIn: ticket.checkedIn ?? false,
        });
      }
      const page = await panelOf(app, cookieA, event.id);
      expect(page.statusCode).toBe(200);
      const { rows } = await db.query<{
        pending: number;
        confirmed: number;
        checked: number;
        refunded: number;
        revenue: number;
      }>(
        `SELECT count(*) FILTER (WHERE status = 'pending') AS pending,
                count(*) FILTER (WHERE status = 'confirmed') AS confirmed,
                count(*) FILTER (WHERE status = 'confirmed' AND checked_in) AS checked,
                count(*) FILTER (WHERE status = 'refunded') AS refunded,
                coalesce(sum(price_paid_cents) FILTER (WHERE status = 'confirmed'), 0) AS revenue
           FROM tickets WHERE event_id = $1`,
        [event.id],
      );
      const direct = rows[0];
      expect(direct, String(index)).toBeDefined();
      const metric = (key: string): number => Number(page.metrics[key]);
      expect(metric('confirmados'), String(index)).toBe(direct?.confirmed);
      expect(metric('pendentes'), String(index)).toBe(direct?.pending);
      expect(metric('check-ins'), String(index)).toBe(direct?.checked);
      expect(metric('estornados'), String(index)).toBe(direct?.refunded);
      expect(page.revenueCents, String(index)).toBe(direct?.revenue);
      expect(metric('vagas-disponiveis'), String(index)).toBe(
        Math.max(0, mix.capacity - metric('pendentes') - metric('confirmados')),
      );
    }
  });
});
