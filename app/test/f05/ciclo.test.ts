// Tratador do resultado do gateway (spec 5.4): só um ingresso pending muda; resposta tardia é
// ignorada e registrada; reentrega e referência desconhecida não mudam nada.
import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { withTransaction } from '../../src/db/transaction.js';
import type { EntregaResultado } from '../../src/features/gateway/public.js';
import { getSeatAvailability, type PurchaseInput, type TicketRecord } from '../../src/features/ingressos/public.js';
import { handlePaymentResult } from '../../src/features/ingressos/lifecycle.js';
import { createTestApp } from '../helpers/app.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { insertTestTicket, settlePayments } from '../helpers/tickets.js';
import { captureLog } from './support.js';

function api(eventId: string, cardNumber: string): PurchaseInput {
  return { eventId, buyer: { type: 'email', email: 'ana@example.com' }, cardNumber, channel: 'api' };
}

async function buy(app: FastifyInstance, eventId: string, cardNumber: string): Promise<TicketRecord> {
  const result = await app.tickets.purchase(api(eventId, cardNumber));
  if (!result.ok) throw new Error(`compra recusada: ${result.reason}`);
  return result.ticket;
}

async function ticketRow(app: FastifyInstance, id: string) {
  const { rows } = await app.db.query<{ status: string; created_at: Date; status_changed_at: Date }>(
    'SELECT status, created_at, status_changed_at FROM tickets WHERE id = $1',
    [id],
  );
  return rows[0];
}

/** Mensagens (msg) registradas pelo logger da aplicação, com os dados. */
function spyLogs(app: FastifyInstance) {
  const calls: { level: string; msg: unknown; data: unknown }[] = [];
  for (const level of ['info', 'warn'] as const) {
    vi.spyOn(app.log, level).mockImplementation((data: unknown, msg: unknown) => {
      calls.push({ level, msg, data });
    });
  }
  return calls;
}

async function setup() {
  const test = await createTestApp();
  const accounts = await seedAccounts();
  const event = (capacity = 5) => insertTestEvent(test.db, { organizerId: accounts.organizadorA.id, capacity });
  return { ...test, ...accounts, event };
}

function delivery(referencia: string, resultado: 'aprovado' | 'recusado'): EntregaResultado {
  const now = new Date();
  return {
    tentativaId: 'pay_0000000000000000',
    referencia,
    resultado,
    finalCartao: '0001',
    solicitadoEm: now,
    prazo: now,
    tentativaDeEntrega: 1,
  };
}

describe('F05 ciclo: resultado do gateway', () => {
  it('F05-CA01 CF04 resultado aprovado deixa o ingresso confirmed', async () => {
    const { app, event } = await setup();
    const e = await event();
    const ticket = await buy(app, e.id, '4000000000000001');
    const logs = spyLogs(app);
    expect(await settlePayments(app, { ticketIds: [ticket.id] })).toBe(1);
    const row = await ticketRow(app, ticket.id);
    expect(row?.status).toBe('confirmed');
    expect(row && row.status_changed_at.getTime() > row.created_at.getTime()).toBe(true);
    expect(logs).toContainEqual({
      level: 'info',
      msg: 'ingressos: resultado do gateway aplicado',
      data: { ticketId: ticket.id, resultado: 'aprovado', status: 'confirmed' },
    });
  });

  it('F05-CA02 CF04 resultado recusado deixa declined e libera a vaga', async () => {
    const { app, db, event } = await setup();
    const e = await event(2);
    const ticket = await buy(app, e.id, '4000000000000004');
    expect((await getSeatAvailability(db, e.id))?.available).toBe(1);
    await settlePayments(app);
    expect((await ticketRow(app, ticket.id))?.status).toBe('declined');
    expect(await getSeatAvailability(db, e.id)).toMatchObject({ occupied: 0, available: 2 });
    for (const card of ['4000000000000002', '4000000000000009']) {
      const other = await buy(app, e.id, card);
      await settlePayments(app, { ticketIds: [other.id] });
      expect((await ticketRow(app, other.id))?.status, card).toBe('declined');
    }
    const approved = await buy(app, e.id, '4000000000000003');
    await settlePayments(app, { ticketIds: [approved.id] });
    expect((await ticketRow(app, approved.id))?.status).toBe('confirmed');
  });

  it('F05-CA08 resultado tardio para ingresso cancelled ou refunded é ignorado e registrado em log', async () => {
    const { app, db, event } = await setup();
    const e = await event();
    const cancelled = await buy(app, e.id, '4000000000000003');
    const refunded = await buy(app, e.id, '4000000000000001');
    await db.query("UPDATE tickets SET status = 'cancelled', status_changed_at = now() WHERE id = $1", [cancelled.id]);
    await db.query("UPDATE tickets SET status = 'confirmed' WHERE id = $1", [refunded.id]);
    await db.query("UPDATE tickets SET status = 'refunded', status_changed_at = now() WHERE id = $1", [refunded.id]);
    const before = [await ticketRow(app, cancelled.id), await ticketRow(app, refunded.id)];

    const logs = spyLogs(app);
    expect(await settlePayments(app)).toBe(2);
    expect([await ticketRow(app, cancelled.id), await ticketRow(app, refunded.id)]).toEqual(before);
    const { rows } = await db.query<{ reference: string; delivered: boolean }>(
      'SELECT reference, delivered_at IS NOT NULL AS delivered FROM payment_attempts ORDER BY reference',
    );
    expect(rows.every((row) => row.delivered)).toBe(true);
    expect(logs).toContainEqual({
      level: 'info',
      msg: 'ingressos: resultado do gateway ignorado',
      data: { ticketId: cancelled.id, resultado: 'aprovado', statusAtual: 'cancelled' },
    });
    expect(logs).toContainEqual({
      level: 'info',
      msg: 'ingressos: resultado do gateway ignorado',
      data: { ticketId: refunded.id, resultado: 'aprovado', statusAtual: 'refunded' },
    });
  });

  it('reentrega do mesmo resultado não muda o ingresso de novo', async () => {
    const { db, event } = await setup();
    const e = await event();
    const ticket = await insertTestTicket(db, { eventId: e.id });
    const capture = captureLog();
    const handler = handlePaymentResult(capture.log);
    await withTransaction(db, (client) => handler(delivery(ticket.id, 'aprovado'), client));
    const first = await db.query<{ status: string; status_changed_at: Date }>(
      'SELECT status, status_changed_at FROM tickets WHERE id = $1',
      [ticket.id],
    );
    await withTransaction(db, (client) => handler(delivery(ticket.id, 'recusado'), client));
    await withTransaction(db, (client) => handler(delivery(ticket.id, 'aprovado'), client));
    const after = await db.query<{ status: string; status_changed_at: Date }>(
      'SELECT status, status_changed_at FROM tickets WHERE id = $1',
      [ticket.id],
    );
    expect(first.rows[0]?.status).toBe('confirmed');
    expect(after.rows).toEqual(first.rows);
    expect(capture.entries.map((entry) => entry.msg)).toEqual([
      'ingressos: resultado do gateway aplicado',
      'ingressos: resultado do gateway ignorado',
      'ingressos: resultado do gateway ignorado',
    ]);
    expect(capture.entries[1]?.data).toEqual({ ticketId: ticket.id, resultado: 'recusado', statusAtual: 'confirmed' });
  });

  it('resultado para referência sem ingresso é ignorado com aviso', async () => {
    const { db } = await setup();
    const capture = captureLog();
    const handler = handlePaymentResult(capture.log);
    await withTransaction(db, (client) => handler(delivery('tkt_0000000000000000', 'aprovado'), client));
    expect(capture.entries).toEqual([
      {
        level: 'warn',
        msg: 'ingressos: resultado do gateway sem ingresso',
        data: { referencia: 'tkt_0000000000000000', resultado: 'aprovado' },
      },
    ]);
  });
});
