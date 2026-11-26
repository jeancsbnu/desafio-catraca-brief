// O painel só existe dentro da página de gestão, que a F04 entrega só ao dono (R13, CF16); o
// módulo painel não registra rotas.
import { describe, expect, it } from 'vitest';
import { insertTestEvent } from '../helpers/events.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { panelLine, panelOf, participantCookie, setup } from './support.js';
import { loginAs } from '../helpers/session.js';

const PANEL_TRACES = ['data-secao="painel"', 'data-metrica=', 'Confirmados', 'Pendentes', 'Check-ins', 'Receita', 'Estornados'];

describe('F09 isolamento do painel', () => {
  it('CF16 o painel só aparece para o dono: organizador B recebe 404, participante 403 e visitante 302 sem nenhum número', async () => {
    const { app, db, accounts, cookieA, cookieB } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 3, priceCents: 7700 });
    await insertTestTicket(db, { eventId: event.id, status: 'confirmed', pricePaidCents: 7700 });
    const owner = await panelOf(app, cookieA, event.id);
    expect(owner.statusCode).toBe(200);
    expect(owner.line).toBe(panelLine(1, 0, 0, 2, 'R$ 77,00', 0));

    const seedParticipant = await loginAs(app, 'participante@catraca.test');
    const newParticipant = await participantCookie(app);
    const cases: [string, string | null, number][] = [
      ['organizador B', cookieB, 404],
      ['participante da seed', seedParticipant, 403],
      ['participante novo', newParticipant.cookie, 403],
      ['visitante', null, 302],
    ];
    for (const [who, cookie, status] of cases) {
      const page = await panelOf(app, cookie, event.id);
      expect(page.statusCode, who).toBe(status);
      expect(page.present, who).toBe(false);
      for (const trace of [...PANEL_TRACES, 'R$ 77,00', event.name]) {
        expect(page.body, `${who}: ${trace}`).not.toContain(trace);
      }
      if (status === 302) expect(page.response.headers.location, who).toBe('/entrar');
      if (status === 404) expect(page.body, who).toContain('Evento não encontrado');
    }
  });

  it('CF16 cada organizador vê no próprio painel só os números do próprio evento', async () => {
    const { app, db, accounts, cookieA, cookieB } = await setup();
    const eventA = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 3, priceCents: 7700 });
    const eventB = await insertTestEvent(db, { organizerId: accounts.organizadorB.id, capacity: 9, priceCents: 2000 });
    await insertTestTicket(db, { eventId: eventA.id, status: 'confirmed', pricePaidCents: 7700 });
    for (let i = 0; i < 4; i += 1) {
      await insertTestTicket(db, { eventId: eventB.id, status: i < 3 ? 'confirmed' : 'refunded', pricePaidCents: 2000 });
    }
    await insertTestTicket(db, { eventId: eventB.id, status: 'pending', pricePaidCents: 2000 });

    const pageA = await panelOf(app, cookieA, eventA.id);
    const pageB = await panelOf(app, cookieB, eventB.id);
    expect(pageA.line).toBe(panelLine(1, 0, 0, 2, 'R$ 77,00', 0));
    expect(pageB.line).toBe(panelLine(3, 1, 0, 5, 'R$ 60,00', 1));
    expect(pageA.body).not.toContain('R$ 60,00');
    expect(pageA.body).not.toContain(eventB.name);
    expect(pageB.body).not.toContain('R$ 77,00');
    expect(pageB.body).not.toContain(eventA.name);
    // Cada um tenta o evento do outro: 404 sem painel.
    expect((await panelOf(app, cookieA, eventB.id)).statusCode).toBe(404);
    expect((await panelOf(app, cookieB, eventA.id)).statusCode).toBe(404);
    expect((await panelOf(app, cookieA, eventB.id)).present).toBe(false);
    expect((await panelOf(app, cookieB, eventA.id)).present).toBe(false);
  });

  it('o módulo painel não registra rotas', async () => {
    const { app, db, accounts, cookieA } = await setup();
    await app.ready();
    expect(app.printRoutes()).not.toContain('painel');
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const response = await app.inject({ method: 'GET', url: `/organizador/eventos/${event.id}/painel`, headers: { cookie: cookieA } });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('data-metrica');
  });
});
