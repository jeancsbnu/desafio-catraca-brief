import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { CLEAR_COOKIE, postForm } from './support.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/features/', import.meta.url));
const HOST = 'localhost:3000';

describe('F02 checagem de origem', () => {
  it('POST com Origin de outro site é bloqueado sem efeito', async () => {
    const { app, db } = await createTestApp();
    await seedAccounts();
    const cookie = await loginAs(app, 'organizador.a@catraca.test');
    const response = await app.inject({
      method: 'POST',
      url: '/sair',
      headers: { cookie, host: HOST, origin: 'http://evil.example' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers.location).toBeUndefined();
    expect(response.body).toContain('<title>Requisição bloqueada · Catraca</title>');
    expect(response.body).toContain('<h1>Requisição bloqueada</h1><p>Origem da requisição não permitida.</p>');
    expect(response.body).toContain('<span class="nav-usuario">Organizador A</span>');
    const { rows } = await db.query('SELECT 1 FROM sessions');
    expect(rows).toHaveLength(1);
    const area = await app.inject({ method: 'GET', url: '/organizador', headers: { cookie } });
    expect(area.statusCode).toBe(200);

    const login = await postForm(
      app,
      '/entrar',
      { email: 'organizador.a@catraca.test', senha: 'catraca123' },
      { host: HOST, origin: 'http://evil.example' },
    );
    expect(login.statusCode).toBe(403);
    expect(login.headers['set-cookie']).toBeUndefined();
    const cadastro = await postForm(
      app,
      '/cadastro',
      { nome: 'X', email: 'x@example.com', senha: 'senha-x-123' },
      { host: HOST, origin: 'http://evil.example' },
    );
    expect(cadastro.statusCode).toBe(403);
    const total = await db.query('SELECT 1 FROM users WHERE email = $1', ['x@example.com']);
    expect(total.rows).toHaveLength(0);
  });

  it('POST com Origin null ou Sec-Fetch-Site cross-site é bloqueado', async () => {
    const { app } = await createTestApp();
    const casos: Record<string, string>[] = [
      { origin: 'null' },
      { 'sec-fetch-site': 'cross-site' },
      { origin: 'http://localhost:3001' },
      { origin: 'http://localhost.evil.example:3000' },
      { origin: 'nao e uma url' },
      { origin: 'ftp://localhost:3000' },
      { origin: 'http://localhost:3000', 'sec-fetch-site': 'cross-site' },
    ];
    for (const headers of casos) {
      const response = await app.inject({ method: 'POST', url: '/sair', headers: { host: HOST, ...headers } });
      expect(response.statusCode, JSON.stringify(headers)).toBe(403);
      expect(response.body).toContain('Origem da requisição não permitida.');
    }
  });

  it('POST com Origin igual ao Host passa', async () => {
    const { app } = await createTestApp();
    for (const headers of [
      { host: HOST, origin: 'http://localhost:3000' },
      { host: 'LOCALHOST:3000', origin: 'http://localhost:3000' },
      { host: 'localhost', origin: 'http://localhost:80' },
      { host: HOST, origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/sair', headers });
      expect(response.statusCode, JSON.stringify(headers)).toBe(302);
      expect(response.headers['set-cookie']).toBe(CLEAR_COOKIE);
    }
  });

  it('POST sem Origin passa', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: 'POST', url: '/sair', headers: { host: HOST } });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/');
  });

  it('GET com Origin de outro site não é bloqueado', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: HOST, origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('formulários de outras features também passam pela checagem', async () => {
    const { app } = await createTestApp({ featuresDir: FIXTURES });
    const bloqueado = await app.inject({
      method: 'POST',
      url: '/teste/formulario',
      headers: { host: HOST, origin: 'http://evil.example' },
    });
    expect(bloqueado.statusCode).toBe(403);
    const permitido = await app.inject({
      method: 'POST',
      url: '/teste/formulario',
      headers: { host: HOST, origin: 'http://localhost:3000' },
    });
    expect(permitido.statusCode).toBe(200);
  });

  it('caminhos /api/ não passam pela checagem de origem nem pela sessão', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/qualquer',
      headers: { host: HOST, origin: 'http://evil.example', cookie: 'catraca_sessao=lixo' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).toBe('{"error":"not_found"}');
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
