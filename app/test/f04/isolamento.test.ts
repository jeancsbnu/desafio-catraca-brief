import { describe, expect, it } from 'vitest';
import {
  EVENT_ROUTE_PREFIX,
  eventManagementPath,
  ownedEvent,
  requireOwnedEvent,
} from '../../src/features/eventos/public.js';
import { createTestApp } from '../helpers/app.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { sessionCookieFor } from '../helpers/session.js';
import { DEPOIS, eventFields, get, postEmpty, postForm, snapshot } from './support.js';

const NOT_FOUND = '<h1>Evento não encontrado</h1>\n<p><a href="/organizador">Voltar para meus eventos</a></p>';

async function setup() {
  const test = await createTestApp();
  const accounts = await seedAccounts();
  const cookieA = await sessionCookieFor(test.app, accounts.organizadorA.id);
  const cookieB = await sessionCookieFor(test.app, accounts.organizadorB.id);
  const draftA = await insertTestEvent(test.db, {
    organizerId: accounts.organizadorA.id,
    name: 'Rascunho secreto de A',
    location: 'Local secreto A',
    capacity: 7,
    priceCents: 7700,
    status: 'rascunho',
  });
  const publishedA = await insertTestEvent(test.db, {
    organizerId: accounts.organizadorA.id,
    name: 'Publicado secreto de A',
    location: 'Local secreto A',
    capacity: 7,
    priceCents: 7700,
  });
  return { ...test, ...accounts, cookieA, cookieB, draftA, publishedA };
}

function expectNoDataOfA(body: string, ids: readonly string[]): void {
  for (const text of ['secreto de A', 'Local secreto A', 'R$ 77,00', '<dd>7</dd>', 'Rascunho', 'Publicado', ...ids]) {
    expect(body, text).not.toContain(text);
  }
}

describe('F04 isolamento entre organizadores', () => {
  it('F04-CA08 lista de B não mostra eventos de A', async () => {
    const { app, db, cookieB, organizadorB, draftA, publishedA } = await setup();
    const ofB = await insertTestEvent(db, { organizerId: organizadorB.id, name: 'Evento de B', status: 'rascunho' });
    const list = await get(app, '/organizador', cookieB);
    expect(list.statusCode).toBe(200);
    expect(list.body).toContain(`<a href="/organizador/eventos/${ofB.id}">Evento de B</a>`);
    for (const text of [draftA.id, publishedA.id, 'secreto de A', 'Local secreto A']) {
      expect(list.body, text).not.toContain(text);
    }
  });

  it('F04-CA08 página de gestão de evento de A aberta por B responde 404 sem dados', async () => {
    const { app, cookieB, draftA, publishedA } = await setup();
    for (const event of [draftA, publishedA]) {
      for (const url of [eventManagementPath(event.id), `${eventManagementPath(event.id)}?ok=criado`, eventManagementPath(event.id, 'cancelar')]) {
        const response = await get(app, url, cookieB);
        expect(response.statusCode, url).toBe(404);
        expect(response.headers.location, url).toBeUndefined();
        expect(response.headers['set-cookie'], url).toBeUndefined();
        expect(response.body).toContain('<title>Evento não encontrado · Catraca</title>');
        expect(response.body).toContain(NOT_FOUND);
        expectNoDataOfA(response.body, [draftA.id, publishedA.id]);
      }
    }
  });

  it('F04-CA08 POSTs de edição, publicação e cancelamento de B em evento de A respondem 404 sem alterar nada', async () => {
    const { app, db, cookieB, draftA, publishedA } = await setup();
    const before = [await snapshot(db, draftA.id), await snapshot(db, publishedA.id)];
    for (const event of [draftA, publishedA]) {
      const responses = [
        await postForm(
          app,
          eventManagementPath(event.id, 'editar'),
          { ...eventFields({ nome: 'Invadido', inicio: DEPOIS.iso, lotacao: '9', preco: '1,00' }) },
          cookieB,
        ),
        await postForm(app, eventManagementPath(event.id, 'editar'), { nome: '' }, cookieB),
        await postEmpty(app, eventManagementPath(event.id, 'publicar'), cookieB),
        await postForm(app, eventManagementPath(event.id, 'cancelar'), { confirmar: 'sim' }, cookieB),
        await postEmpty(app, eventManagementPath(event.id, 'cancelar'), cookieB),
      ];
      for (const response of responses) {
        expect(response.statusCode).toBe(404);
        expect(response.body).toContain(NOT_FOUND);
        expect(response.body).not.toContain('Informe o nome do evento');
        expectNoDataOfA(response.body, [draftA.id, publishedA.id]);
      }
    }
    expect([await snapshot(db, draftA.id), await snapshot(db, publishedA.id)]).toEqual(before);
    const { rows } = await db.query("SELECT count(*)::int AS n FROM events WHERE name = 'Invadido'");
    expect(rows).toEqual([{ n: 0 }]);
  });

  it('404 de evento alheio é idêntico ao de evento inexistente e ao de id inválido', async () => {
    const { app, cookieA, cookieB, draftA, publishedA, organizadorB, db } = await setup();
    const urls = [
      '/organizador/eventos/evt_0000000000000000',
      eventManagementPath(draftA.id),
      eventManagementPath(publishedA.id),
      eventManagementPath(publishedA.id, 'cancelar'),
      '/organizador/eventos/nao-e-um-id',
      '/organizador/eventos/EVT_AAAAAAAAAAAAAAAA',
      `/organizador/eventos/${draftA.id}x`,
    ];
    const bodies = await Promise.all(urls.map(async (url) => (await get(app, url, cookieB)).body));
    for (const body of bodies) expect(body).toBe(bodies[0]);
    const posts = await Promise.all([
      postEmpty(app, '/organizador/eventos/evt_0000000000000000/publicar', cookieB),
      postEmpty(app, eventManagementPath(publishedA.id, 'publicar'), cookieB),
      postEmpty(app, '/organizador/eventos/nao-e-um-id/publicar', cookieB),
    ]);
    for (const response of posts) {
      expect(response.statusCode).toBe(404);
      expect(response.body).toBe(bodies[0]);
    }

    // E o contrário: A não abre evento de B.
    const ofB = await insertTestEvent(db, { organizerId: organizadorB.id, name: 'Só de B' });
    const response = await get(app, eventManagementPath(ofB.id), cookieA);
    expect(response.statusCode).toBe(404);
    expect(response.body).toContain(NOT_FOUND);
    expect(response.body).not.toContain('Só de B');
  });

  it('rota de ação acrescentada com requireOwnedEvent herda o isolamento', async () => {
    const test = await createTestApp();
    const handled: string[] = [];
    test.app.post(`${EVENT_ROUTE_PREFIX}/teste`, { preHandler: requireOwnedEvent }, async (request, reply) => {
      const event = ownedEvent(request);
      handled.push(event.id);
      return test.app.events.renderManagementPage(request, reply, event, {
        messages: [{ kind: 'success', text: 'Ação de teste feita' }],
      });
    });
    test.app.get('/organizador/teste-sem-guarda/:id', async (request) => ownedEvent(request).id);
    const accounts = await seedAccounts();
    const event = await insertTestEvent(test.db, { organizerId: accounts.organizadorA.id, name: 'Evento com ação' });
    const cookieA = await sessionCookieFor(test.app, accounts.organizadorA.id);
    const cookieB = await sessionCookieFor(test.app, accounts.organizadorB.id);
    const cookieP = await sessionCookieFor(test.app, accounts.participante.id);

    const owner = await postEmpty(test.app, eventManagementPath(event.id, 'teste'), cookieA);
    expect(owner.statusCode).toBe(200);
    expect(owner.body).toContain('<p class="msg msg-success" role="status">Ação de teste feita</p>');
    expect(owner.body).toContain('<h1>Evento com ação</h1>');
    expect(handled).toEqual([event.id]);

    const other = await postEmpty(test.app, eventManagementPath(event.id, 'teste'), cookieB);
    expect(other.statusCode).toBe(404);
    expect(other.body).toContain(NOT_FOUND);
    expect(other.body).not.toContain('Evento com ação');
    const participant = await postEmpty(test.app, eventManagementPath(event.id, 'teste'), cookieP);
    expect(participant.statusCode).toBe(403);
    const visitor = await postEmpty(test.app, eventManagementPath(event.id, 'teste'));
    expect(visitor.statusCode).toBe(302);
    expect(visitor.headers.location).toBe('/entrar');
    expect(handled).toEqual([event.id]);

    const unguarded = await get(test.app, `/organizador/teste-sem-guarda/${event.id}`, cookieA);
    expect(unguarded.statusCode).toBe(500);
  });
});
