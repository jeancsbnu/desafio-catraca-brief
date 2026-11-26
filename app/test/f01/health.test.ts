import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';

describe('F01 GET /health', () => {
  it('F01-CA01 GET /health responde 200 com {"status":"ok"}', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"status":"ok"}');
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('GET /health responde 503 quando o banco está inacessível', async () => {
    const { app } = await createTestApp({
      config: { DATABASE_URL: 'postgres://catraca:catraca@127.0.0.1:1/catraca_test' },
    });
    const started = Date.now();
    const response = await app.inject({ method: 'GET', url: '/health' });
    const elapsed = Date.now() - started;
    expect(response.statusCode).toBe(503);
    expect(response.body).toBe('{"status":"erro","motivo":"banco de dados indisponível"}');
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(elapsed).toBeLessThan(3000);
  });
});
