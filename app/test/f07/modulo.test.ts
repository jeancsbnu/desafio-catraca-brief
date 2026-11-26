// Carga do módulo parceiros, cabeçalhos comuns e ausência de sessão na API (spec 4, 5.1, 5.7).
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { JSON_TYPE, apiGet, rawPurchase, setup } from './support.js';

describe('F07 módulo parceiros', () => {
  it('o módulo parceiros carrega depois de eventos e ingressos e registra as três rotas', async () => {
    const { app } = await createTestApp();
    const modules = app.featureModules;
    expect(modules).toContain('parceiros');
    expect(modules.indexOf('parceiros')).toBeGreaterThan(modules.indexOf('eventos'));
    expect(modules.indexOf('parceiros')).toBeGreaterThan(modules.indexOf('ingressos'));
    expect(app.hasPlugin('parceiros')).toBe(true);
    const mod = (await import('../../src/features/parceiros/index.js')) as { loadOrder?: number };
    expect(mod.loadOrder).toBeUndefined();
    await app.ready();
    expect(app.hasRoute({ method: 'GET', url: '/api/partner/events' })).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/api/partner/events/:eventId/purchases' })).toBe(true);
    expect(app.hasRoute({ method: 'GET', url: '/api/partner/tickets/:ticketId' })).toBe(true);
  });

  it('toda resposta da API tem content-type JSON e cache-control no-store', async () => {
    const { app, db, event } = await setup();
    const open = await event({ capacity: 5 });
    const full = await event({ capacity: 1 });
    await insertTestTicket(db, { eventId: full.id, status: 'confirmed' });
    const ticket = await insertTestTicket(db, { eventId: open.id });
    const responses = [
      [200, await apiGet(app, '/api/partner/events')],
      [200, await apiGet(app, `/api/partner/tickets/${ticket.id}`)],
      [202, await rawPurchase(app, open.id)],
      [401, await apiGet(app, '/api/partner/events', null)],
      [404, await apiGet(app, '/api/partner/tickets/tkt_0000000000000000')],
      [404, await rawPurchase(app, 'evt_0000000000000000')],
      [404, await apiGet(app, '/api/partner/nada')],
      [409, await rawPurchase(app, full.id)],
      [422, await rawPurchase(app, open.id, { payload: '{' })],
    ] as const;
    for (const [status, response] of responses) {
      expect(response.statusCode).toBe(status);
      expect(response.headers['content-type'], String(status)).toBe(JSON_TYPE);
      expect(response.headers['cache-control'], String(status)).toBe('no-store');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('a API não lê nem grava sessão', async () => {
    const { app, event } = await setup();
    const e = await event({ capacity: 5 });
    const cookie = 'catraca_sessao=valor-invalido.assinatura-invalida';
    const key = app.config.partnerApiKey;
    const responses = [
      await app.inject({ method: 'GET', url: '/api/partner/nada', headers: { cookie } }),
      await app.inject({ method: 'GET', url: '/api/partner/events', headers: { cookie, 'x-api-key': key } }),
      await rawPurchase(app, e.id, { headers: { cookie } }),
      await rawPurchase(app, e.id, { headers: { cookie }, payload: '{' }),
    ];
    for (const response of responses) {
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });
});
