// Ciclo do ingresso visto pela API (F04 + F05 → F07): resultado do gateway, vagas e cancelamento.
import { describe, expect, it } from 'vitest';
import { loginAs } from '../helpers/session.js';
import { settlePayments } from '../helpers/tickets.js';
import { postForm } from '../f04/support.js';
import {
  EVENT_NOT_AVAILABLE,
  SOLD_OUT,
  apiGet,
  buyApi,
  buyVitrine,
  listedEvent,
  occupiedAndTotal,
  rawPurchase,
  setup,
} from './support.js';

describe('F07 ciclo do ingresso pela API', () => {
  it('F07-CA10 CF11 a consulta mostra confirmed com 0001 e declined com 0004, e a recusa devolve a vaga', async () => {
    const { app, db, event, participante } = await setup();
    const e = await event({ capacity: 2 });
    expect((await listedEvent(app, e.id))?.availableSeats).toBe(2);
    const vitrine = await buyVitrine(app, e.id, participante.id);
    await settlePayments(app, { ticketIds: [vitrine.id] });
    expect((await apiGet(app, `/api/partner/tickets/${vitrine.id}`)).json()).toMatchObject({ status: 'confirmed' });
    expect((await listedEvent(app, e.id))?.availableSeats).toBe(1);

    const t2 = await buyApi(app, e.id, '4000000000000004', 't2@example.com');
    expect((await listedEvent(app, e.id))?.availableSeats).toBe(0);
    const refused = await rawPurchase(app, e.id, { payload: '{"buyerEmail":"t3@example.com","cardNumber":"4000000000000001"}' });
    expect(refused.statusCode).toBe(409);
    expect(refused.body).toBe(SOLD_OUT);
    expect((await apiGet(app, `/api/partner/tickets/${t2.ticketId}`)).json()).toMatchObject({ status: 'pending' });

    await settlePayments(app, { ticketIds: [t2.ticketId] });
    expect((await apiGet(app, `/api/partner/tickets/${t2.ticketId}`)).body).toBe(
      `{"ticketId":"${t2.ticketId}","code":"${t2.code}","eventId":"${e.id}","status":"declined","checkedIn":false}`,
    );
    expect((await listedEvent(app, e.id))?.availableSeats).toBe(1);

    const t3 = await buyApi(app, e.id, '4000000000000001', 't3@example.com');
    expect((await listedEvent(app, e.id))?.availableSeats).toBe(0);
    await settlePayments(app, { ticketIds: [t3.ticketId] });
    expect((await apiGet(app, `/api/partner/tickets/${t3.ticketId}`)).body).toBe(
      `{"ticketId":"${t3.ticketId}","code":"${t3.code}","eventId":"${e.id}","status":"confirmed","checkedIn":false}`,
    );
    expect(await occupiedAndTotal(db, e.id)).toEqual({ occupied: 2, total: 3 });
  });

  it('F07-CA04 CF13 depois de cancelar pela página de gestão a consulta mostra refunded e cancelled e a compra responde 404', async () => {
    const { app, db, event } = await setup();
    const cookieA = await loginAs(app, 'organizador.a@catraca.test');
    const e = await event({ capacity: 5 });
    const confirmed = await buyApi(app, e.id, '4000000000000001', 't6@example.com');
    await settlePayments(app, { ticketIds: [confirmed.ticketId] });
    const pending = await buyApi(app, e.id, '4000000000000003', 't5@example.com');
    expect((await apiGet(app, `/api/partner/tickets/${confirmed.ticketId}`)).json()).toMatchObject({ status: 'confirmed' });

    const cancel = await postForm(app, `/organizador/eventos/${e.id}/cancelar`, { confirmar: 'sim' }, cookieA);
    expect(cancel.statusCode).toBe(302);
    expect(cancel.headers.location).toBe(`/organizador/eventos/${e.id}?ok=cancelado`);

    expect(await listedEvent(app, e.id)).toBeUndefined();
    const purchase = await rawPurchase(app, e.id);
    expect(purchase.statusCode).toBe(404);
    expect(purchase.body).toBe(EVENT_NOT_AVAILABLE);
    const ticketBody = (t: { ticketId: string; code: string }, status: string) =>
      `{"ticketId":"${t.ticketId}","code":"${t.code}","eventId":"${e.id}","status":"${status}","checkedIn":false}`;
    expect((await apiGet(app, `/api/partner/tickets/${confirmed.ticketId}`)).body).toBe(ticketBody(confirmed, 'refunded'));
    expect((await apiGet(app, `/api/partner/tickets/${pending.ticketId}`)).body).toBe(ticketBody(pending, 'cancelled'));

    // O gateway aprova o 0003 depois do cancelamento: continua cancelled.
    expect(await settlePayments(app, { ticketIds: [pending.ticketId] })).toBe(1);
    expect((await apiGet(app, `/api/partner/tickets/${pending.ticketId}`)).body).toBe(ticketBody(pending, 'cancelled'));
    expect(await occupiedAndTotal(db, e.id)).toEqual({ occupied: 0, total: 2 });
  });
});
