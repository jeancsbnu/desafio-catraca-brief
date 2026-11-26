// Tratador de "evento cancelado" (spec 5.5) pelo cancelamento real da página de gestão da F04.
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { findTicketById, getSeatAvailability, type TicketRecord } from '../../src/features/ingressos/public.js';
import { createTestApp } from '../helpers/app.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { insertTestTicket, settlePayments } from '../helpers/tickets.js';
import { postForm } from '../f04/support.js';
import { CARD_OK } from './support.js';

async function setup() {
  const test = await createTestApp();
  const accounts = await seedAccounts();
  const cookieA = await loginAs(test.app, 'organizador.a@catraca.test');
  const event = (capacity = 5) => insertTestEvent(test.db, { organizerId: accounts.organizadorA.id, capacity });
  return { ...test, ...accounts, cookieA, event };
}

async function buy(app: FastifyInstance, eventId: string, cardNumber: string): Promise<TicketRecord> {
  const result = await app.tickets.purchase({
    eventId,
    buyer: { type: 'email', email: 'ana@example.com' },
    cardNumber,
    channel: 'api',
  });
  if (!result.ok) throw new Error(`compra recusada: ${result.reason}`);
  return result.ticket;
}

function cancel(app: FastifyInstance, eventId: string, cookie: string) {
  return postForm(app, `/organizador/eventos/${eventId}/cancelar`, { confirmar: 'sim' }, cookie);
}

describe('F05 cancelamento do evento', () => {
  it('F05-CA08 CF06 cancelar pela página de gestão leva confirmed a refunded e pending a cancelled na mesma transação', async () => {
    const { app, db, cookieA, event } = await setup();
    const e = await event();
    const confirmed = await buy(app, e.id, CARD_OK);
    await settlePayments(app, { ticketIds: [confirmed.id] });
    const pending = await buy(app, e.id, '4000000000000003');

    const response = await cancel(app, e.id, cookieA);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`/organizador/eventos/${e.id}?ok=cancelado`);
    const { rows } = await db.query<{ id: string; status: string; same_tx: boolean }>(
      `SELECT t.id, t.status, t.status_changed_at = e.cancelled_at AS same_tx
         FROM tickets t JOIN events e ON e.id = t.event_id WHERE t.event_id = $1 ORDER BY t.created_at`,
      [e.id],
    );
    expect(rows).toEqual([
      { id: confirmed.id, status: 'refunded', same_tx: true },
      { id: pending.id, status: 'cancelled', same_tx: true },
    ]);
    expect(await getSeatAvailability(db, e.id)).toMatchObject({ eventStatus: 'cancelado', occupied: 0, available: 0 });
  });

  it('F05-CA08 CF06 resposta do gateway depois do cancelamento não muda o pendente cancelado', async () => {
    const { app, db, cookieA, event } = await setup();
    const e = await event();
    const pending = await buy(app, e.id, '4000000000000003');
    expect((await cancel(app, e.id, cookieA)).statusCode).toBe(302);
    const before = await findTicketById(db, pending.id);
    expect(before?.status).toBe('cancelled');
    expect(await settlePayments(app)).toBe(1);
    const { rows } = await db.query<{ result: string; delivered: boolean }>(
      'SELECT result, delivered_at IS NOT NULL AS delivered FROM payment_attempts WHERE reference = $1',
      [pending.id],
    );
    expect(rows).toEqual([{ result: 'aprovado', delivered: true }]);
    expect(await findTicketById(db, pending.id)).toEqual(before);
  });

  it('CF06 F05-CA09 evento cancelado tem 0 vagas e recusa compra como event_not_available', async () => {
    const { app, db, cookieA, event } = await setup();
    const e = await event(3);
    expect((await cancel(app, e.id, cookieA)).statusCode).toBe(302);
    expect(await getSeatAvailability(db, e.id)).toEqual({
      eventId: e.id,
      eventStatus: 'cancelado',
      capacity: 3,
      occupied: 0,
      available: 0,
    });
    expect(
      await app.tickets.purchase({ eventId: e.id, buyer: { type: 'email', email: 'ana@example.com' }, cardNumber: CARD_OK, channel: 'api' }),
    ).toEqual({ ok: false, reason: 'event_not_available' });
  });

  it('declined e ingressos com check-in seguem as regras no cancelamento', async () => {
    const { app, db, cookieA, event } = await setup();
    const e = await event();
    const declined = await insertTestTicket(db, { eventId: e.id, status: 'declined' });
    const checkedIn = await insertTestTicket(db, { eventId: e.id, status: 'confirmed', checkedIn: true });
    expect((await cancel(app, e.id, cookieA)).statusCode).toBe(302);
    expect(await findTicketById(db, declined.id)).toEqual(declined);
    expect(await findTicketById(db, checkedIn.id)).toMatchObject({
      status: 'refunded',
      checkedIn: true,
      checkedInAt: checkedIn.checkedInAt,
    });
  });
});
