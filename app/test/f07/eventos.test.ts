// GET /api/partner/events (spec 5.3): só eventos à venda, exatamente os cinco campos do brief.
import { describe, expect, it } from 'vitest';
import { loginAs } from '../helpers/session.js';
import { insertTestEvent } from '../helpers/events.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { createViaHttp, eventFields, postEmpty, postForm, PROX } from '../f04/support.js';
import { JSON_TYPE, apiGet, listedEvent, setup } from './support.js';

const FIELDS = ['id', 'name', 'startsAt', 'priceCents', 'availableSeats'];

describe('F07 listagem de eventos', () => {
  it('F07-CA01 lista só eventos publicados com exatamente id, name, startsAt, priceCents e availableSeats', async () => {
    const { app, db, organizadorA, organizadorB } = await setup();
    const at = (day: number) => new Date(Date.UTC(2026, 11, day, 23, 0, 0));
    await insertTestEvent(db, { organizerId: organizadorA.id, status: 'rascunho', startsAt: at(1) });
    const a = await insertTestEvent(db, { organizerId: organizadorA.id, name: 'Jazz no Porão', capacity: 2, priceCents: 10000, startsAt: at(5) });
    await insertTestEvent(db, { organizerId: organizadorA.id, status: 'cancelado', startsAt: at(2) });
    const b = await insertTestEvent(db, { organizerId: organizadorB.id, name: 'Samba "do" Bê', capacity: 7, priceCents: 2550, startsAt: at(3) });
    await insertTestEvent(db, { organizerId: organizadorB.id, status: 'rascunho', startsAt: at(4) });
    await insertTestEvent(db, { organizerId: organizadorB.id, status: 'cancelado', startsAt: at(6) });

    const response = await apiGet(app, '/api/partner/events');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe(JSON_TYPE);
    const expected = [
      { id: b.id, name: 'Samba "do" Bê', startsAt: '2026-12-03T20:00:00-03:00', priceCents: 2550, availableSeats: 7 },
      { id: a.id, name: 'Jazz no Porão', startsAt: '2026-12-05T20:00:00-03:00', priceCents: 10000, availableSeats: 2 },
    ];
    expect(response.body).toBe(JSON.stringify(expected));
    for (const item of response.json<Record<string, unknown>[]>()) {
      expect(Object.keys(item)).toEqual(FIELDS);
    }
  });

  it('F07-CA01 startsAt é ISO 8601 com segundos e -03:00', async () => {
    const { app, event } = await setup();
    const exact = await event({ startsAt: new Date('2026-12-06T00:00:00Z') });
    const seconds = await event({ startsAt: new Date('2026-12-07T00:00:30Z') });
    expect((await listedEvent(app, exact.id))?.startsAt).toBe('2026-12-05T21:00:00-03:00');
    expect((await listedEvent(app, seconds.id))?.startsAt).toBe('2026-12-06T21:00:30-03:00');
  });

  it('F07-CA01 availableSeats segue R05', async () => {
    const { app, db, event } = await setup();
    const five = await event({ capacity: 5 });
    for (const status of ['pending', 'confirmed', 'declined', 'cancelled'] as const) {
      await insertTestTicket(db, { eventId: five.id, status });
    }
    const one = await event({ capacity: 1 });
    await insertTestTicket(db, { eventId: one.id, status: 'pending' });
    const empty = await event({ capacity: 3 });
    expect((await listedEvent(app, five.id))?.availableSeats).toBe(3);
    expect((await listedEvent(app, one.id))?.availableSeats).toBe(0);
    expect((await listedEvent(app, empty.id))?.availableSeats).toBe(3);
  });

  it('F07-CA01 sem eventos à venda a listagem é []', async () => {
    const { app, event } = await setup();
    await event({ status: 'rascunho' });
    await event({ status: 'cancelado' });
    const response = await apiGet(app, '/api/partner/events?pagina=2');
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('[]');
    expect(response.headers['content-type']).toBe(JSON_TYPE);
  });

  it('F07-CA01 CF10 evento criado e publicado pela página de gestão aparece com priceCents 10000 e, depois de mudar o preço para R$ 150,00, 15000', async () => {
    const { app } = await setup();
    const cookieA = await loginAs(app, 'organizador.a@catraca.test');
    const id = await createViaHttp(app, cookieA, { nome: 'Jazz no Porão', lotacao: '2', preco: '100,00' });
    expect(await listedEvent(app, id)).toBeUndefined();

    const published = await postEmpty(app, `/organizador/eventos/${id}/publicar`, cookieA);
    expect(published.statusCode).toBe(302);
    expect(await listedEvent(app, id)).toEqual({
      id,
      name: 'Jazz no Porão',
      startsAt: `${PROX.iso}:00-03:00`,
      priceCents: 10000,
      availableSeats: 2,
    });

    const fields = { ...eventFields({ nome: 'Jazz no Porão', lotacao: '2', preco: '150,00' }) };
    const edited = await postForm(app, `/organizador/eventos/${id}/editar`, fields, cookieA);
    expect(edited.statusCode).toBe(302);
    expect(edited.headers.location).toBe(`/organizador/eventos/${id}?ok=atualizado`);
    const listed = await listedEvent(app, id);
    expect(listed?.priceCents).toBe(15000);
    expect(listed?.availableSeats).toBe(2);
  });

  it('CF10 rascunho e evento cancelado pela página de gestão não aparecem', async () => {
    const { app } = await setup();
    const cookieA = await loginAs(app, 'organizador.a@catraca.test');
    const draft = await createViaHttp(app, cookieA, { nome: 'Rascunho F07' });
    const cancelled = await createViaHttp(app, cookieA, { nome: 'Cancelado F07' });
    expect((await postEmpty(app, `/organizador/eventos/${cancelled}/publicar`, cookieA)).statusCode).toBe(302);
    expect(await listedEvent(app, cancelled)).toBeDefined();

    const cancel = await postForm(app, `/organizador/eventos/${cancelled}/cancelar`, { confirmar: 'sim' }, cookieA);
    expect(cancel.statusCode).toBe(302);
    expect(cancel.headers.location).toBe(`/organizador/eventos/${cancelled}?ok=cancelado`);
    expect(await listedEvent(app, draft)).toBeUndefined();
    expect(await listedEvent(app, cancelled)).toBeUndefined();
    expect((await apiGet(app, '/api/partner/events')).body).toBe('[]');
  });
});
