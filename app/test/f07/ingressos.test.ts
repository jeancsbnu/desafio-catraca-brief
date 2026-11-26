// GET /api/partner/tickets/{ticketId} (spec 5.5): exatamente os cinco campos do brief, qualquer canal.
import { describe, expect, it } from 'vitest';
import { insertTestTicket } from '../helpers/tickets.js';
import { JSON_TYPE, TICKET_NOT_FOUND, apiGet, buyApi, buyVitrine, setup } from './support.js';

describe('F07 consulta do ingresso', () => {
  it('F07-CA08 consulta responde 200 com exatamente ticketId, code, eventId, status e checkedIn false num ingresso novo', async () => {
    const { app, event } = await setup();
    const e = await event({ capacity: 5 });
    const { ticketId, code } = await buyApi(app, e.id);
    const response = await apiGet(app, `/api/partner/tickets/${ticketId}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe(JSON_TYPE);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toBe(`{"ticketId":"${ticketId}","code":"${code}","eventId":"${e.id}","status":"pending","checkedIn":false}`);
    expect(Object.keys(response.json<Record<string, unknown>>())).toEqual(['ticketId', 'code', 'eventId', 'status', 'checkedIn']);
  });

  it('F07-CA08 ingresso comprado pela vitrine aparece na consulta', async () => {
    const { app, event, participante } = await setup();
    const e = await event({ capacity: 5 });
    const ticket = await buyVitrine(app, e.id, participante.id);
    expect(ticket.channel).toBe('vitrine');
    expect(ticket.buyerUserId).toBe(participante.id);
    const response = await apiGet(app, `/api/partner/tickets/${ticket.id}`);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(`{"ticketId":"${ticket.id}","code":"${ticket.code}","eventId":"${e.id}","status":"pending","checkedIn":false}`);
  });

  it('F07-CA08 status e checkedIn refletem o ingresso', async () => {
    const { app, db, event } = await setup();
    const e = await event({ capacity: 10 });
    for (const status of ['pending', 'confirmed', 'declined', 'cancelled', 'refunded'] as const) {
      const ticket = await insertTestTicket(db, { eventId: e.id, status });
      const response = await apiGet(app, `/api/partner/tickets/${ticket.id}`);
      expect(response.statusCode, status).toBe(200);
      expect(response.json(), status).toEqual({ ticketId: ticket.id, code: ticket.code, eventId: e.id, status, checkedIn: false });
    }
    const checkedIn = await insertTestTicket(db, { eventId: e.id, status: 'confirmed', checkedIn: true });
    const response = await apiGet(app, `/api/partner/tickets/${checkedIn.id}`);
    expect(response.body).toBe(`{"ticketId":"${checkedIn.id}","code":"${checkedIn.code}","eventId":"${e.id}","status":"confirmed","checkedIn":true}`);

    // Evento cancelado depois: a consulta continua respondendo, com o status gravado.
    await db.query("UPDATE events SET status = 'cancelado', cancelled_at = now() WHERE id = $1", [e.id]);
    expect((await apiGet(app, `/api/partner/tickets/${checkedIn.id}`)).statusCode).toBe(200);
  });

  it('F07-CA08 ingresso inexistente, id inválido, código no lugar do id ou id em maiúsculas responde 404 ticket_not_found', async () => {
    const { app, event } = await setup();
    const e = await event({ capacity: 5 });
    const { ticketId, code } = await buyApi(app, e.id);
    for (const id of ['tkt_0000000000000000', 'nao-e-um-ingresso', code, ticketId.toUpperCase(), `${ticketId}x`]) {
      const response = await apiGet(app, `/api/partner/tickets/${id}`);
      expect(response.statusCode, id).toBe(404);
      expect(response.body, id).toBe(TICKET_NOT_FOUND);
      expect(response.headers['content-type']).toBe(JSON_TYPE);
    }
    expect((await apiGet(app, `/api/partner/tickets/${ticketId}`)).statusCode).toBe(200);
  });

  it('F07-CA08 id de ingresso com mais de 100 caracteres responde 404 ticket_not_found', async () => {
    const { app } = await setup();
    const longId = `tkt_${'a'.repeat(146)}`;
    const response = await apiGet(app, `/api/partner/tickets/${longId}`);
    expect(response.statusCode).toBe(404);
    expect(response.body).toBe(TICKET_NOT_FOUND);
    const withoutKey = await apiGet(app, `/api/partner/tickets/${longId}`, null);
    expect(withoutKey.statusCode).toBe(401);
    const head = await app.inject({ method: 'HEAD', url: `/api/partner/tickets/${longId}`, headers: { 'x-api-key': app.config.partnerApiKey } });
    expect(head.statusCode).toBe(404);
  });
});
