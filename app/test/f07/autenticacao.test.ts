// Chave de parceiro (spec 5.2, 5.6): 401 antes de qualquer outra verificação, em qualquer rota sob
// /api/partner, com comparação em tempo constante.
import { describe, expect, it } from 'vitest';
import { digestKey, partnerKeyMatches } from '../../src/features/parceiros/auth.js';
import { createTestApp } from '../helpers/app.js';

const UNAUTHORIZED = '{"error":"unauthorized"}';
const NOT_FOUND = '{"error":"not_found"}';
const JSON_TYPE = 'application/json; charset=utf-8';

describe('F07 chave de parceiro', () => {
  it('F07-CA09 qualquer método e caminho sob /api/partner exige a chave', async () => {
    const { app } = await createTestApp();
    const key = app.config.partnerApiKey;
    const unknown: [method: 'GET' | 'DELETE' | 'PUT' | 'OPTIONS' | 'POST', url: string][] = [
      ['GET', '/api/partner'],
      ['GET', '/api/partner/'],
      ['GET', '/api/partner/nada'],
      ['GET', '/api/partner/events/'],
      ['DELETE', '/api/partner/events'],
      ['PUT', '/api/partner/tickets/tkt_0000000000000000'],
      ['OPTIONS', '/api/partner/events'],
      ['POST', '/api/partner/events'],
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

    const head = await app.inject({ method: 'HEAD', url: '/api/partner/nada' });
    expect(head.statusCode).toBe(401);
    expect(head.headers['content-type']).toBe(JSON_TYPE);

    // Fora do prefixo não é rota de parceiro: o 404 de API da F01, sem exigir chave.
    const outside = await app.inject({ method: 'GET', url: '/api/partnerx' });
    expect(outside.statusCode).toBe(404);
    expect(outside.body).toBe(NOT_FOUND);
  });

  it('partnerKeyMatches compara digests e não lança com tamanhos diferentes', () => {
    const expected = digestKey('parceiro-catraca-dev');
    expect(expected).toHaveLength(32);
    expect(partnerKeyMatches('parceiro-catraca-dev', expected)).toBe(true);
    for (const received of ['', undefined, null, 42, ['parceiro-catraca-dev'], 'parceiro', 'parceiro-catraca-dev-mais-longa', 'parceiro-catraca-deV', 'PARCEIRO-CATRACA-DEV', ' parceiro-catraca-dev']) {
      expect(() => partnerKeyMatches(received, expected)).not.toThrow();
      expect(partnerKeyMatches(received, expected), String(received)).toBe(false);
    }
  });
});
