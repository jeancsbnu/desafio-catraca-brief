import { describe, expect, it } from 'vitest';
import { html } from '../../src/core/html.js';
import { withTransaction } from '../../src/db/transaction.js';
import {
  EVENT_ROUTE_PREFIX,
  ownedEvent,
  requireOwnedEvent,
  type EventStatus,
  type ManagementSectionContext,
} from '../../src/features/eventos/public.js';
// Módulos de F01–F04 (sem o ingressos da F05, que registra o próprio tratador/provedor).
import { createBaseTestApp as createTestApp } from '../helpers/base-features.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { sessionCookieFor } from '../helpers/session.js';
import { get, postEmpty } from './support.js';

const LATE = 'eventos: registro de extensão depois de a aplicação ficar pronta';
const render = (): ReturnType<typeof html> => html`<p>x</p>`;

describe('F04 pontos de extensão: registros', () => {
  it('nome de seção repetido, reservado ou inválido lança erro', async () => {
    const { app } = await createTestApp();
    app.events.addManagementSection({ name: 'checkin', order: 100, render });
    expect(() => app.events.addManagementSection({ name: 'checkin', order: 1, render })).toThrow(/seção repetida/);
    expect(() => app.events.addManagementSection({ name: 'edicao', order: 1, render })).toThrow(/reservado/);
    for (const name of ['Check In', 'check in', '1painel', '', '-x', 'painel_x']) {
      expect(() => app.events.addManagementSection({ name, order: 1, render }), name).toThrow(/nome de seção inválido/);
    }
    expect(() => app.events.addManagementSection({ name: 'painel', order: Number.NaN, render })).toThrow(/order/);
    app.events.addManagementSection({ name: 'painel-2', order: 200, render });
  });

  it('segundo provedor de vagas lança erro', async () => {
    const { app } = await createTestApp();
    app.events.setOccupiedSeatsProvider(async () => 0);
    expect(() => app.events.setOccupiedSeatsProvider(async () => 1)).toThrow(/já registrado/);
  });

  it('registro depois de a aplicação ficar pronta lança erro', async () => {
    const { app } = await createTestApp();
    await app.ready();
    expect(() => app.events.addManagementSection({ name: 'tarde', order: 1, render })).toThrow(LATE);
    expect(() => app.events.setOccupiedSeatsProvider(async () => 0)).toThrow(LATE);
    expect(() => app.events.onEventCancelled(async () => {})).toThrow(LATE);
  });

  it('vagas ocupadas: zero sem provedor; valor do provedor; valor inválido é erro de programação', async () => {
    const semProvedor = await createTestApp();
    await withTransaction(semProvedor.db, async (client) => {
      expect(await semProvedor.app.events.occupiedSeats(client, 'evt_0000000000000000')).toBe(0);
    });

    const comProvedor = await createTestApp();
    const chamadas: string[] = [];
    let valor: unknown = 3;
    comProvedor.app.events.setOccupiedSeatsProvider(async (_client, eventId) => {
      chamadas.push(eventId);
      return valor as number;
    });
    await withTransaction(comProvedor.db, async (client) => {
      expect(await comProvedor.app.events.occupiedSeats(client, 'evt_0000000000000001')).toBe(3);
      for (const invalido of [-1, 1.5, Number.NaN, '2', null]) {
        valor = invalido;
        await expect(comProvedor.app.events.occupiedSeats(client, 'evt_0000000000000001')).rejects.toThrow(
          /valor inválido/,
        );
      }
    });
    expect(chamadas[0]).toBe('evt_0000000000000001');
  });
});

describe('F04 pontos de extensão: página de gestão', () => {
  it('seções registradas aparecem depois do conteúdo da F04, na ordem, em rascunho, publicado e cancelado', async () => {
    const { app, db } = await createTestApp();
    app.events.addManagementSection({ name: 'painel', order: 200, render: ({ event }) => html`<h2>Painel</h2><p>${event.status}</p>` });
    app.events.addManagementSection({ name: 'checkin', order: 100, render: () => html`<h2>Check-in</h2>` });
    app.events.addManagementSection({ name: 'extra', order: 200, render: async () => html`<p>&</p>` });
    const { organizadorA } = await seedAccounts();
    const cookie = await sessionCookieFor(app, organizadorA.id);
    const statuses: EventStatus[] = ['rascunho', 'publicado', 'cancelado'];
    for (const status of statuses) {
      const event = await insertTestEvent(db, { organizerId: organizadorA.id, status });
      const body = (await get(app, `/organizador/eventos/${event.id}`, cookie)).body;
      const sections = [
        '<section class="gestao-secao" data-secao="checkin"><h2>Check-in</h2></section>',
        `<section class="gestao-secao" data-secao="painel"><h2>Painel</h2><p>${status}</p></section>`,
        '<section class="gestao-secao" data-secao="extra"><p>&</p></section>',
      ].join('\n');
      expect(body, status).toContain(`${sections}\n<p><a href="/organizador">Voltar para meus eventos</a></p>`);
      expect(body.indexOf('</dl>'), status).toBeLessThan(body.indexOf('data-secao="checkin"'));
      if (status !== 'cancelado') {
        expect(body.indexOf('data-secao="edicao"'), status).toBeLessThan(body.indexOf('data-secao="checkin"'));
      }
    }
  });

  it('seção recebe evento, organizador, banco e o estado da requisição', async () => {
    const { app, db } = await createTestApp();
    const contexts: ManagementSectionContext[] = [];
    app.events.addManagementSection({
      name: 'checkin',
      order: 100,
      render: (context) => {
        contexts.push(context);
        return html`<p>estado: ${JSON.stringify(context.state ?? null)}</p>`;
      },
    });
    app.post(`${EVENT_ROUTE_PREFIX}/checkin`, { preHandler: requireOwnedEvent }, async (request, reply) =>
      app.events.renderManagementPage(request, reply, ownedEvent(request), {
        status: 422,
        sectionState: { checkin: { x: 1 }, outra: 2 },
      }),
    );
    const { organizadorA } = await seedAccounts();
    const cookie = await sessionCookieFor(app, organizadorA.id);
    const event = await insertTestEvent(db, { organizerId: organizadorA.id });

    const page = await get(app, `/organizador/eventos/${event.id}`, cookie);
    expect(page.body).toContain('<p>estado: null</p>');
    const action = await postEmpty(app, `/organizador/eventos/${event.id}/checkin`, cookie);
    expect(action.statusCode).toBe(422);
    expect(action.body).toContain('<p>estado: {&quot;x&quot;:1}</p>');

    expect(contexts).toHaveLength(2);
    const last = contexts[1];
    expect(last?.event).toEqual(event);
    expect(last?.organizer).toMatchObject({ id: organizadorA.id, role: 'organizador' });
    expect(last?.db).toBe(db);
    expect(last?.state).toEqual({ x: 1 });
    expect(last?.request.url).toBe(`/organizador/eventos/${event.id}/checkin`);
  });

  it('renderManagementPage mostra mensagens no topo e recusa evento de outro organizador', async () => {
    const { app, db } = await createTestApp();
    app.post(`${EVENT_ROUTE_PREFIX}/destaque`, { preHandler: requireOwnedEvent }, async (request, reply) =>
      app.events.renderManagementPage(request, reply, ownedEvent(request), {
        messages: [
          { kind: 'success', text: 'Check-in feito' },
          { kind: 'error', text: 'Outra mensagem' },
        ],
      }),
    );
    const accounts = await seedAccounts();
    const eventOfB = await insertTestEvent(db, { organizerId: accounts.organizadorB.id });
    app.post('/organizador/forcar-evento-alheio', async (request, reply) =>
      app.events.renderManagementPage(request, reply, eventOfB),
    );
    const cookie = await sessionCookieFor(app, accounts.organizadorA.id);
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, name: 'Evento com destaque' });

    const page = await postEmpty(app, `/organizador/eventos/${event.id}/destaque`, cookie);
    expect(page.statusCode).toBe(200);
    const success = page.body.indexOf('<p class="msg msg-success" role="status">Check-in feito</p>');
    const error = page.body.indexOf('<p class="msg msg-error" role="alert">Outra mensagem</p>');
    const heading = page.body.indexOf('<h1>Evento com destaque</h1>');
    expect(success).toBeGreaterThan(0);
    expect(success).toBeLessThan(error);
    expect(error).toBeLessThan(heading);

    const foreign = await postEmpty(app, '/organizador/forcar-evento-alheio', cookie);
    expect(foreign.statusCode).toBe(500);
    expect(foreign.body).not.toContain(eventOfB.name);
  });

  it('exceção numa seção responde a página 500', async () => {
    const { app, db } = await createTestApp();
    app.events.addManagementSection({
      name: 'quebrada',
      order: 1,
      render: () => {
        throw new Error('seção com defeito');
      },
    });
    const { organizadorA } = await seedAccounts();
    const cookie = await sessionCookieFor(app, organizadorA.id);
    const event = await insertTestEvent(db, { organizerId: organizadorA.id });
    const response = await get(app, `/organizador/eventos/${event.id}`, cookie);
    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('<h1>Algo deu errado. Tente novamente.</h1>');
  });
});
