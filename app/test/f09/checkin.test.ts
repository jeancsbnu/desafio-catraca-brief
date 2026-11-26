// Check-ins no painel (R10, R12): só o Entrada liberada (F08) muda um número, e só Check-ins.
import { describe, expect, it } from 'vitest';
import { postCheckIn } from '../helpers/checkin.js';
import { insertTestEvent } from '../helpers/events.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { postForm } from '../f04/support.js';
import { panelLine, panelOf, readPanel, setup } from './support.js';

describe('F09 check-ins no painel', () => {
  it('F09-CA05 CF18 check-in liberado soma 1 em Check-ins sem mudar Confirmados nem os outros números', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 5, priceCents: 10000 });
    const first = await insertTestTicket(db, { eventId: event.id, status: 'confirmed', pricePaidCents: 10000 });
    await insertTestTicket(db, { eventId: event.id, status: 'confirmed', pricePaidCents: 15000 });
    await insertTestTicket(db, { eventId: event.id, status: 'pending', pricePaidCents: 15000 });
    await insertTestTicket(db, { eventId: event.id, status: 'refunded', pricePaidCents: 10000 });
    expect((await panelOf(app, cookieA, event.id)).line).toBe(panelLine(2, 1, 0, 2, 'R$ 250,00', 1));

    const response = await postCheckIn(app, cookieA, event.id, first.code);
    expect(response.statusCode).toBe(200);
    expect(response.result).toBe('liberada');
    expect(response.message).toBe('Entrada liberada');
    // O painel da própria resposta (renderizada depois do commit) já conta a entrada.
    const expected = panelLine(2, 1, 1, 2, 'R$ 250,00', 1);
    expect(readPanel(response.body).line).toBe(expected);
    expect((await panelOf(app, cookieA, event.id)).line).toBe(expected);
  });

  it('CF18 check-ins recusados não mudam nenhum número', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 6 });
    const other = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 2 });
    const used = await insertTestTicket(db, { eventId: event.id, status: 'confirmed', checkedIn: true, pricePaidCents: 2000 });
    await insertTestTicket(db, { eventId: event.id, status: 'confirmed', pricePaidCents: 3000 });
    const pending = await insertTestTicket(db, { eventId: event.id, status: 'pending' });
    const declined = await insertTestTicket(db, { eventId: event.id, status: 'declined' });
    const foreign = await insertTestTicket(db, { eventId: other.id, status: 'confirmed' });
    const line = panelLine(2, 1, 1, 3, 'R$ 50,00', 0);
    expect((await panelOf(app, cookieA, event.id)).line).toBe(line);

    const attempts: [string, string][] = [
      [used.code, 'ja_utilizado'],
      [pending.code, 'nao_confirmado'],
      [declined.code, 'nao_confirmado'],
      ['ZZZZZZZZ', 'invalido'],
      [foreign.code, 'invalido'],
      ['', 'codigo_vazio'],
    ];
    for (const [code, result] of attempts) {
      const response = await postCheckIn(app, cookieA, event.id, code);
      expect(response.result, code).toBe(result);
      expect(readPanel(response.body).line, code).toBe(line);
      expect((await panelOf(app, cookieA, event.id)).line, code).toBe(line);
    }
    // O ingresso do outro evento não foi marcado: o painel dele continua sem check-in.
    expect((await panelOf(app, cookieA, other.id)).line).toBe(panelLine(1, 0, 0, 1, 'R$ 100,00', 0));

    // Evento cancelado: o confirmado virou refunded; o check-in recusado não muda nada.
    const cancelled = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 3 });
    const kept = await insertTestTicket(db, { eventId: cancelled.id, status: 'confirmed' });
    const done = await postForm(app, `/organizador/eventos/${cancelled.id}/cancelar`, { confirmar: 'sim' }, cookieA);
    expect(done.statusCode).toBe(302);
    const cancelledLine = panelLine(0, 0, 0, 0, 'R$ 0,00', 1);
    expect((await panelOf(app, cookieA, cancelled.id)).line).toBe(cancelledLine);
    const response = await postCheckIn(app, cookieA, cancelled.id, kept.code);
    expect(response.result).toBe('evento_cancelado');
    expect(readPanel(response.body).line).toBe(cancelledLine);
    expect((await panelOf(app, cookieA, cancelled.id)).line).toBe(cancelledLine);
  });

  it('F09-CA05 estornado que passou pelo check-in sai de Check-ins e de Confirmados depois do cancelamento', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 3, priceCents: 1000 });
    const a = await insertTestTicket(db, { eventId: event.id, status: 'confirmed', pricePaidCents: 1000 });
    await insertTestTicket(db, { eventId: event.id, status: 'confirmed', pricePaidCents: 1000 });
    const checked = await postCheckIn(app, cookieA, event.id, a.code);
    expect(checked.result).toBe('liberada');
    expect(readPanel(checked.body).line).toBe(panelLine(2, 0, 1, 1, 'R$ 20,00', 0));

    const done = await postForm(app, `/organizador/eventos/${event.id}/cancelar`, { confirmar: 'sim' }, cookieA);
    expect(done.statusCode).toBe(302);
    expect((await panelOf(app, cookieA, event.id)).line).toBe(panelLine(0, 0, 0, 0, 'R$ 0,00', 2));
    const { rows } = await db.query<{ status: string; checked_in: boolean }>(
      'SELECT status, checked_in FROM tickets WHERE id = $1',
      [a.id],
    );
    expect(rows[0]).toEqual({ status: 'refunded', checked_in: true });
  });
});
