// Chave de parceiro (spec 5.2, 5.6): 401 antes de qualquer outra verificação, em qualquer rota sob
// /api/partner, com comparação em tempo constante e log sem o valor recebido.
import { describe, expect, it, vi } from 'vitest';
import { digestKey, partnerKeyMatches } from '../../src/features/parceiros/auth.js';
import { createTestApp } from '../helpers/app.js';
import { insertTestTicket } from '../helpers/tickets.js';
import {
  BRIEF_BODY,
  JSON_TYPE,
  NOT_FOUND,
  UNAUTHORIZED,
  apiGet,
  captureLogLines,
  countRows,
  parseLogLines,
  rawPurchase,
  setup,
} from './support.js';

describe('F07 chave de parceiro', () => {
  it('F07-CA09 sem X-Api-Key as três rotas respondem 401 unauthorized', async () => {
    const { app, db, event } = await setup();
    const e = await event({ capacity: 5 });
    const ticket = await insertTestTicket(db, { eventId: e.id });

    const responses = [
      await apiGet(app, '/api/partner/events', null),
      await rawPurchase(app, e.id, { key: null }),
      await apiGet(app, `/api/partner/tickets/${ticket.id}`, null),
    ];
    for (const response of responses) {
      expect(response.statusCode).toBe(401);
      expect(response.body).toBe(UNAUTHORIZED);
      expect(response.headers['content-type']).toBe(JSON_TYPE);
      expect(response.headers['www-authenticate']).toBeUndefined();
    }
    expect(await countRows(db, 'tickets')).toBe(1);
  });

  it('F07-CA09 chave errada, vazia, em maiúsculas, com sufixo, repetida, no Authorization ou na query responde 401', async () => {
    const { app, db, event } = await setup();
    const e = await event({ capacity: 5 });
    const ticket = await insertTestTicket(db, { eventId: e.id });
    const key = app.config.partnerApiKey;
    const variants: { label: string; headers: Record<string, string | string[]>; query?: string }[] = [
      { label: 'errada', headers: { 'x-api-key': 'chave-errada' } },
      { label: 'vazia', headers: { 'x-api-key': '' } },
      { label: 'maiúsculas', headers: { 'x-api-key': key.toUpperCase() } },
      { label: 'sufixo', headers: { 'x-api-key': `${key}x` } },
      { label: 'prefixo', headers: { 'x-api-key': key.slice(0, -1) } },
      { label: 'repetida', headers: { 'x-api-key': [key, key] } },
      { label: 'authorization', headers: { authorization: `Bearer ${key}` } },
      { label: 'query', headers: {}, query: `?X-Api-Key=${key}&x-api-key=${key}` },
    ];
    for (const variant of variants) {
      const query = variant.query ?? '';
      const responses = [
        await app.inject({ method: 'GET', url: `/api/partner/events${query}`, headers: variant.headers }),
        await app.inject({
          method: 'POST',
          url: `/api/partner/events/${e.id}/purchases${query}`,
          headers: { ...variant.headers, 'content-type': 'application/json' },
          payload: BRIEF_BODY,
        }),
        await app.inject({ method: 'GET', url: `/api/partner/tickets/${ticket.id}${query}`, headers: variant.headers }),
      ];
      for (const response of responses) {
        expect(response.statusCode, variant.label).toBe(401);
        expect(response.body, variant.label).toBe(UNAUTHORIZED);
      }
    }
    expect(await countRows(db, 'tickets')).toBe(1);
  });

  it('F07-CA09 a chave é verificada antes do corpo, do evento e da vaga', async () => {
    const { app, db, event } = await setup();
    const cancelled = await event({ status: 'cancelado' });
    const full = await event({ capacity: 1 });
    await insertTestTicket(db, { eventId: full.id, status: 'confirmed' });
    const open = await event({ capacity: 5 });
    const spy = vi.spyOn(app.tickets, 'purchase');
    const before = await countRows(db, 'tickets');

    const cases = [
      await rawPurchase(app, open.id, { key: null, payload: '{"buyerEmail":' }),
      await rawPurchase(app, open.id, { key: 'chave-errada', contentType: 'text/plain' }),
      await rawPurchase(app, open.id, { key: null, payload: `{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001","x":"${'a'.repeat(20 * 1024)}"}` }),
      await rawPurchase(app, cancelled.id, { key: null, payload: '{"buyerEmail":"ana@example.com","cardNumber":"123"}' }),
      await rawPurchase(app, cancelled.id, { key: 'chave-errada' }),
      await rawPurchase(app, full.id, { key: null }),
      await rawPurchase(app, 'evt_0000000000000000', { key: 'chave-errada' }),
      await apiGet(app, '/api/partner/tickets/tkt_0000000000000000', null),
      await apiGet(app, '/api/partner/tickets/tkt_0000000000000000', 'chave-errada'),
    ];
    for (const response of cases) {
      expect(response.statusCode).toBe(401);
      expect(response.body).toBe(UNAUTHORIZED);
    }
    expect(spy).not.toHaveBeenCalled();
    expect(await countRows(db, 'tickets')).toBe(before);
  });

  it('F07-CA09 qualquer método e caminho sob /api/partner exige a chave', async () => {
    const { app } = await createTestApp();
    const key = app.config.partnerApiKey;
    const unknown: [method: 'GET' | 'DELETE' | 'PUT' | 'OPTIONS' | 'POST' | 'PATCH', url: string][] = [
      ['GET', '/api/partner'],
      ['GET', '/api/partner/'],
      ['GET', '/api/partner/nada'],
      ['GET', '/api/partner/events/'],
      ['GET', '/api/partner/events/evt_0000000000000000/purchases'],
      ['DELETE', '/api/partner/events'],
      ['PUT', '/api/partner/tickets/tkt_0000000000000000'],
      ['PATCH', '/api/partner/tickets/tkt_0000000000000000'],
      ['OPTIONS', '/api/partner/events'],
      ['POST', '/api/partner/events'],
      ['POST', '/api/partner/tickets/tkt_0000000000000000'],
    ];
    for (const [method, url] of unknown) {
      const withoutKey = await app.inject({ method, url });
      expect(withoutKey.statusCode, `${method} ${url} sem chave`).toBe(401);
      expect(withoutKey.body, `${method} ${url} sem chave`).toBe(UNAUTHORIZED);
      expect(withoutKey.headers['content-type']).toBe(JSON_TYPE);

      const withKey = await app.inject({ method, url, headers: { 'x-api-key': key } });
      expect(withKey.statusCode, `${method} ${url} com chave`).toBe(404);
      expect(withKey.body, `${method} ${url} com chave`).toBe(NOT_FOUND);
      expect(withKey.headers['content-type']).toBe(JSON_TYPE);
    }

    const headWithoutKey = await app.inject({ method: 'HEAD', url: '/api/partner/events' });
    expect(headWithoutKey.statusCode).toBe(401);
    expect(headWithoutKey.headers['content-type']).toBe(JSON_TYPE);
    const headWithKey = await app.inject({ method: 'HEAD', url: '/api/partner/events', headers: { 'x-api-key': key } });
    expect(headWithKey.statusCode).toBe(200);
    expect(headWithKey.headers['content-type']).toBe(JSON_TYPE);
    expect(headWithKey.body).toBe('');

    // Fora do prefixo não é rota de parceiro: o 404 de API da F01, sem exigir chave.
    const outside = await app.inject({ method: 'GET', url: '/api/partnerx' });
    expect(outside.statusCode).toBe(404);
    expect(outside.body).toBe(NOT_FOUND);
  });

  it('F07-CA09 o nome do cabeçalho não diferencia maiúsculas', async () => {
    const { app } = await createTestApp();
    for (const name of ['X-API-KEY', 'x-api-key', 'X-Api-Key']) {
      const response = await app.inject({ method: 'GET', url: '/api/partner/events', headers: { [name]: app.config.partnerApiKey } });
      expect(response.statusCode, name).toBe(200);
      expect(response.body).toBe('[]');
    }
  });

  it('PARTNER_API_KEY configurada substitui a chave padrão', async () => {
    const { app } = await createTestApp({ config: { PARTNER_API_KEY: 'chave-de-teste-f07' } });
    expect(app.config.partnerApiKey).toBe('chave-de-teste-f07');
    const standard = await apiGet(app, '/api/partner/events', 'parceiro-catraca-dev');
    expect(standard.statusCode).toBe(401);
    expect(standard.body).toBe(UNAUTHORIZED);
    const configured = await apiGet(app, '/api/partner/events', 'chave-de-teste-f07');
    expect(configured.statusCode).toBe(200);
  });

  it('partnerKeyMatches compara digests e não lança com tamanhos diferentes', () => {
    const expected = digestKey('parceiro-catraca-dev');
    expect(expected).toHaveLength(32);
    expect(partnerKeyMatches('parceiro-catraca-dev', expected)).toBe(true);
    const others: unknown[] = [
      '',
      undefined,
      null,
      42,
      ['parceiro-catraca-dev'],
      'parceiro',
      'parceiro-catraca-dev-mais-longa',
      'parceiro-catraca-deV',
      'PARCEIRO-CATRACA-DEV',
      ' parceiro-catraca-dev',
      'parceiro-catraca-dev, parceiro-catraca-dev',
    ];
    for (const received of others) {
      expect(() => partnerKeyMatches(received, expected)).not.toThrow();
      expect(partnerKeyMatches(received, expected), String(received)).toBe(false);
    }
  });

  it('o 401 registra o motivo e nunca o valor recebido', async () => {
    const { app } = await createTestApp({ config: { LOG_LEVEL: 'info' } });
    await app.ready();
    const lines = captureLogLines(app);
    await apiGet(app, '/api/partner/events', null);
    await apiGet(app, '/api/partner/events', 'chave-errada-f07');
    await rawPurchase(app, 'evt_0000000000000000', { key: 'chave-errada-f07' });
    await apiGet(app, '/api/partner/tickets/tkt_0000000000000000?x=1', 'chave-errada-f07');

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).not.toContain('chave-errada-f07');
    const refusals = parseLogLines(lines).filter((line) => line.msg === 'parceiros: requisição sem chave válida');
    expect(refusals.map((line) => [line.level, line.motivo, line.method, line.caminho])).toEqual([
      [40, 'ausente', 'GET', '/api/partner/events'],
      [40, 'invalida', 'GET', '/api/partner/events'],
      [40, 'invalida', 'POST', '/api/partner/events/evt_0000000000000000/purchases'],
      [40, 'invalida', 'GET', '/api/partner/tickets/tkt_0000000000000000'],
    ]);
  });
});
