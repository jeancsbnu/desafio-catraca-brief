// A marcação de check-in que a F09 lê (spec "Como a F09 usa a marcação"): só a liberação escreve;
// tentativas recusadas não mudam nenhum número do resumo da F05.
import { describe, expect, it } from 'vitest';
import { checkInTicket } from '../../src/features/checkin/public.js';
import { findTicketById, summarizeEventTickets } from '../../src/features/ingressos/public.js';
import { postCheckIn } from '../helpers/checkin.js';
import { insertTestEvent } from '../helpers/events.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { setup } from './support.js';

describe('F08 marcação de check-in', () => {
  it('a marcação de check-in é lida pela F05 como checkedIn e confirmedCheckedIn', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    const before = await summarizeEventTickets(db, event.id);
    expect((await postCheckIn(app, cookieA, event.id, ticket.code)).result).toBe('liberada');
    const after = await summarizeEventTickets(db, event.id);
    expect(after).toEqual({ ...before, confirmedCheckedIn: before.confirmedCheckedIn + 1 });
    expect(after.confirmed).toBe(before.confirmed);
    const read = await findTicketById(db, ticket.id);
    expect(read?.checkedIn).toBe(true);
    expect(read?.checkedInAt).toBeInstanceOf(Date);
    expect(read?.status).toBe('confirmed');
  });

  it('tentativas recusadas não mudam nenhum número do resumo', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const used = await insertTestTicket(db, { eventId: event.id, status: 'confirmed', checkedIn: true });
    const pending = await insertTestTicket(db, { eventId: event.id, status: 'pending' });
    await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    const before = await summarizeEventTickets(db, event.id);
    for (const code of ['ZZZZZZZZ', pending.code, used.code, '', '  ']) {
      const response = await postCheckIn(app, cookieA, event.id, code);
      expect(response.result, JSON.stringify(code)).not.toBe('liberada');
      expect(await summarizeEventTickets(db, event.id)).toEqual(before);
    }

    const cancelled = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, status: 'cancelado' });
    const refunded = await insertTestTicket(db, { eventId: cancelled.id, status: 'refunded', checkedIn: true });
    const cancelledBefore = await summarizeEventTickets(db, cancelled.id);
    expect((await postCheckIn(app, cookieA, cancelled.id, refunded.code)).result).toBe('evento_cancelado');
    expect(await summarizeEventTickets(db, cancelled.id)).toEqual(cancelledBefore);
    // Estornado com check-in não conta em Check-ins (não é confirmed).
    expect(cancelledBefore.confirmedCheckedIn).toBe(0);
  });

  it('postCheckIn devolve o resultado e a mensagem do check-in', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    const released = await postCheckIn(app, cookieA, event.id, ticket.code);
    expect(released).toMatchObject({ statusCode: 200, result: 'liberada', message: 'Entrada liberada' });
    expect(released.body).toContain('data-secao="checkin"');
    expect(await postCheckIn(app, cookieA, event.id, '')).toMatchObject({
      statusCode: 422,
      result: 'codigo_vazio',
      message: 'Informe o código do ingresso',
    });
    const asVisitor = await postCheckIn(app, '', event.id, ticket.code);
    expect(asVisitor).toMatchObject({ statusCode: 302, result: null, message: null });
    // O serviço (sem HTTP) devolve o mesmo resultado e o evento lido sob a trava.
    const outcome = await checkInTicket(db, event.id, ticket.code);
    expect(outcome).toMatchObject({ result: 'ja_utilizado', message: 'Ingresso já utilizado', code: ticket.code });
    expect(outcome.ticket?.id).toBe(ticket.id);
    expect(outcome.event?.id).toBe(event.id);
  });
});
