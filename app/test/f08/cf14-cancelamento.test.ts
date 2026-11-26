// CF14 (F04 → F08): o cancelamento real pela página de gestão da F04 e o check-in do evento
// cancelado (R10, R11).
import { describe, expect, it } from 'vitest';
import { postCheckIn } from '../helpers/checkin.js';
import { insertTestEvent } from '../helpers/events.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { get, postForm } from '../f04/support.js';
import { emptySectionHtml, setup, ticketMark } from './support.js';

describe('F08 CF14 cancelamento e check-in', () => {
  it('CF14 depois do cancelamento pela página de gestão, a seção continua e os ingressos do evento resultam em Evento cancelado', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const used = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    const confirmed = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    const pending = await insertTestTicket(db, { eventId: event.id, status: 'pending' });
    const declined = await insertTestTicket(db, { eventId: event.id, status: 'declined' });
    expect((await postCheckIn(app, cookieA, event.id, used.code)).result).toBe('liberada');
    const usedAt = (await ticketMark(db, used.id))?.checked_in_at;

    const cancel = await postForm(app, `/organizador/eventos/${event.id}/cancelar`, { confirmar: 'sim' }, cookieA);
    expect(cancel.statusCode).toBe(302);
    expect(cancel.headers.location).toBe(`/organizador/eventos/${event.id}?ok=cancelado`);

    const page = await get(app, `/organizador/eventos/${event.id}`, cookieA);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<strong data-status="cancelado">Cancelado</strong>');
    expect(page.body).toContain(emptySectionHtml(event.id));

    for (const ticket of [used, confirmed, pending, declined]) {
      const response = await postCheckIn(app, cookieA, event.id, ticket.code);
      expect(response, ticket.status).toMatchObject({ statusCode: 200, result: 'evento_cancelado', message: 'Evento cancelado' });
      expect(response.body).toContain('name="codigo"');
    }
    expect(await ticketMark(db, used.id)).toEqual({ status: 'refunded', checked_in: true, checked_in_at: usedAt });
    expect(await ticketMark(db, confirmed.id)).toEqual({ status: 'refunded', checked_in: false, checked_in_at: null });
    expect(await ticketMark(db, pending.id)).toEqual({ status: 'cancelled', checked_in: false, checked_in_at: null });
    expect(await ticketMark(db, declined.id)).toEqual({ status: 'declined', checked_in: false, checked_in_at: null });
  });

  it('CF14 em evento cancelado, código de outro evento resulta em Ingresso inválido para este evento', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const other = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const otherTicket = await insertTestTicket(db, { eventId: other.id, status: 'confirmed' });
    const cancel = await postForm(app, `/organizador/eventos/${event.id}/cancelar`, { confirmar: 'sim' }, cookieA);
    expect(cancel.statusCode).toBe(302);

    const response = await postCheckIn(app, cookieA, event.id, otherTicket.code);
    expect(response).toMatchObject({ statusCode: 200, result: 'invalido', message: 'Ingresso inválido para este evento' });
    expect(response.body).toContain('<strong data-status="cancelado">Cancelado</strong>');
    expect(await ticketMark(db, otherTicket.id)).toMatchObject({ status: 'confirmed', checked_in: false });

    expect((await postCheckIn(app, cookieA, other.id, otherTicket.code)).result).toBe('liberada');
  });
});
