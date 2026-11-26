// Só o dono opera o check-in (R04, R13): o guarda da F04 responde 404 antes de qualquer leitura do
// código; participante e visitante são barrados pela F02 (spec 5.1, 5.6).
import { describe, expect, it } from 'vitest';
import { postCheckIn } from '../helpers/checkin.js';
import { insertTestEvent } from '../helpers/events.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { loginAs } from '../helpers/session.js';
import { get } from '../f04/support.js';
import { checkinLogs, setup, ticketSnapshot } from './support.js';

describe('F08 isolamento do check-in', () => {
  it('CF14 organizador B recebe 404 Evento não encontrado no check-in de evento de A, sem processar o código', async () => {
    const { app, db, accounts, logs: calls } = await setup({ captureLogs: true });
    const cookieB = await loginAs(app, 'organizador.b@catraca.test');
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    const before = await ticketSnapshot(db, ticket.id);

    const missing = await postCheckIn(app, cookieB, 'evt_0000000000000000', ticket.code);
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toContain('<h1>Evento não encontrado</h1>');

    const attempts = [
      await postCheckIn(app, cookieB, event.id, ticket.code),
      await postCheckIn(app, cookieB, event.id, ''),
      await postCheckIn(app, cookieB, event.id, 'ZZZZZZZZ'),
      await postCheckIn(app, cookieB, 'id-invalido', ticket.code),
    ];
    for (const attempt of attempts) {
      expect(attempt.statusCode).toBe(404);
      expect(attempt.result).toBeNull();
      // Idêntico byte a byte ao de evento inexistente: nada do evento, do código ou do resultado.
      expect(attempt.body).toBe(missing.body);
      expect(attempt.body).not.toContain(event.name);
      expect(attempt.body).not.toContain(ticket.code);
      expect(attempt.body).not.toContain('Informe o código');
      expect(attempt.body).not.toContain('name="codigo"');
    }
    const viaGet = await get(app, `/organizador/eventos/${event.id}/checkin`, cookieB);
    expect(viaGet.statusCode).toBe(404);
    expect(viaGet.body).toBe(missing.body);

    expect(await ticketSnapshot(db, ticket.id)).toBe(before);
    expect(checkinLogs(calls)).toEqual([]);
  });

  it('CF14 participante recebe 403 e visitante é redirecionado para /entrar', async () => {
    const { app, db, accounts, logs: calls } = await setup({ captureLogs: true });
    const cookieP = await loginAs(app, 'participante@catraca.test');
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    const before = await ticketSnapshot(db, ticket.id);

    const participant = await postCheckIn(app, cookieP, event.id, ticket.code);
    expect(participant.statusCode).toBe(403);
    expect(participant.body).toContain('Acesso negado');
    expect(participant.body).not.toContain(event.name);
    expect(participant.result).toBeNull();

    const visitor = await postCheckIn(app, '', event.id, ticket.code);
    expect(visitor.statusCode).toBe(302);
    expect(visitor.result).toBeNull();
    const visitorGet = await app.inject({ method: 'GET', url: `/organizador/eventos/${event.id}/checkin` });
    expect(visitorGet.statusCode).toBe(302);
    expect(visitorGet.headers.location).toBe('/entrar');

    const raw = await app.inject({
      method: 'POST',
      url: `/organizador/eventos/${event.id}/checkin`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `codigo=${ticket.code}`,
    });
    expect(raw.statusCode).toBe(302);
    expect(raw.headers.location).toBe('/entrar');

    expect(await ticketSnapshot(db, ticket.id)).toBe(before);
    expect(checkinLogs(calls)).toEqual([]);
  });

  it('CF14 B no próprio evento com código de ingresso de A recebe Ingresso inválido para este evento', async () => {
    const { app, db, accounts } = await setup();
    const cookieB = await loginAs(app, 'organizador.b@catraca.test');
    const eventA = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const eventB = await insertTestEvent(db, { organizerId: accounts.organizadorB.id });
    const ticket = await insertTestTicket(db, { eventId: eventA.id, status: 'confirmed' });
    const before = await ticketSnapshot(db, ticket.id);
    const response = await postCheckIn(app, cookieB, eventB.id, ticket.code);
    expect(response).toMatchObject({ statusCode: 200, result: 'invalido', message: 'Ingresso inválido para este evento' });
    expect(response.body).toContain(`<h1>${eventB.name}</h1>`);
    expect(response.body).not.toContain(eventA.name);
    expect(response.body).not.toContain(ticket.id);
    expect(await ticketSnapshot(db, ticket.id)).toBe(before);
  });

  it('a página de gestão de B não mostra a seção de check-in de A', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const cookieB = await loginAs(app, 'organizador.b@catraca.test');
    const eventA = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const asB = await get(app, `/organizador/eventos/${eventA.id}`, cookieB);
    expect(asB.statusCode).toBe(404);
    expect(asB.body).not.toContain('data-secao="checkin"');
    expect(asB.body).not.toContain(`/organizador/eventos/${eventA.id}/checkin`);
    const asA = await get(app, `/organizador/eventos/${eventA.id}`, cookieA);
    expect(asA.statusCode).toBe(200);
    expect(asA.body).toContain('data-secao="checkin"');
  });
});
