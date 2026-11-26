import { describe, expect, it } from 'vitest';
import { signToken } from '../../src/features/contas/cookie.js';
import { createSession } from '../../src/features/contas/sessions.js';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs, sessionCookieFor } from '../helpers/session.js';
import { CLEAR_COOKIE as CLEAR } from './support.js';

describe('F02 sessão', () => {
  it('sessão vale 12 horas', async () => {
    const { app, db } = await createTestApp();
    const { participante } = await seedAccounts();
    await loginAs(app, 'participante@catraca.test');
    await createSession(app.db, participante.id);
    const { rows } = await db.query<{ seconds: number }>(
      'SELECT round(extract(epoch FROM expires_at - created_at))::int AS seconds FROM sessions WHERE user_id = $1',
      [participante.id],
    );
    expect(rows).toEqual([{ seconds: 43200 }, { seconds: 43200 }]);
  });

  it('o banco guarda só o hash do token', async () => {
    const { app, db } = await createTestApp();
    await seedAccounts();
    const cookie = await loginAs(app, 'participante@catraca.test');
    const token = cookie.slice('catraca_sessao='.length).split('.')[0] ?? '';
    const { rows } = await db.query<{ token_hash: string }>('SELECT token_hash FROM sessions');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.token_hash).not.toContain(token);
  });

  it('F02-CA05 Sair apaga a sessão, limpa o cookie e redireciona para /', async () => {
    const { app, db } = await createTestApp();
    const { participante } = await seedAccounts();
    const cookie = await loginAs(app, 'participante@catraca.test');
    const response = await app.inject({ method: 'POST', url: '/sair', headers: { cookie } });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/');
    expect(response.headers['set-cookie']).toBe(CLEAR);
    const { rows } = await db.query('SELECT 1 FROM sessions WHERE user_id = $1', [participante.id]);
    expect(rows).toHaveLength(0);
    const depois = await app.inject({ method: 'GET', url: '/', headers: { cookie } });
    expect(depois.body).toContain('<a href="/entrar">Entrar</a>');
  });

  it('F02-CA05 depois de Sair, /organizador e /meus-ingressos redirecionam para /entrar mesmo reenviando o cookie antigo', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    for (const email of ['participante@catraca.test', 'organizador.a@catraca.test']) {
      const cookie = await loginAs(app, email);
      const sair = await app.inject({ method: 'POST', url: '/sair', headers: { cookie } });
      expect(sair.statusCode).toBe(302);

      // Navegador: o cookie foi apagado (Max-Age=0).
      const semCookieOrg = await app.inject({ method: 'GET', url: '/organizador' });
      expect(semCookieOrg.headers.location).toBe('/entrar');
      const semCookieMeus = await app.inject({ method: 'GET', url: '/meus-ingressos' });
      expect(semCookieMeus.headers.location).toBe('/entrar?voltar=%2Fmeus-ingressos');

      // Cookie copiado antes da saída: a sessão não existe mais.
      const org = await app.inject({ method: 'GET', url: '/organizador', headers: { cookie } });
      expect(org.statusCode, email).toBe(302);
      expect(org.headers.location, email).toBe('/entrar');
      expect(org.headers['set-cookie'], email).toBe(CLEAR);
      const meus = await app.inject({ method: 'GET', url: '/meus-ingressos', headers: { cookie } });
      expect(meus.statusCode, email).toBe(302);
      expect(meus.headers.location, email).toBe('/entrar?voltar=%2Fmeus-ingressos');
      expect(meus.headers['set-cookie'], email).toBe(CLEAR);
    }
  });

  it('Sair sem sessão também redireciona para /', async () => {
    const { app } = await createTestApp();
    for (const headers of [{}, { cookie: 'catraca_sessao=lixo' }]) {
      const response = await app.inject({ method: 'POST', url: '/sair', headers });
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/');
      expect(response.headers['set-cookie']).toBe(CLEAR);
    }
    const get = await app.inject({ method: 'GET', url: '/sair' });
    expect(get.statusCode).toBe(404);
  });

  it('Sair apaga a sessão mesmo já expirada', async () => {
    const { app, db } = await createTestApp();
    await seedAccounts();
    const cookie = await loginAs(app, 'participante@catraca.test');
    await db.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    const response = await app.inject({ method: 'POST', url: '/sair', headers: { cookie } });
    expect(response.statusCode).toBe(302);
    const { rows } = await db.query('SELECT 1 FROM sessions');
    expect(rows).toHaveLength(0);
  });

  it('sessão expirada é tratada como visitante e o cookie é limpo', async () => {
    const { app, db } = await createTestApp();
    const { organizadorB } = await seedAccounts();
    const cookie = await sessionCookieFor(app, organizadorB.id);
    const antes = await app.inject({ method: 'GET', url: '/organizador', headers: { cookie } });
    expect(antes.statusCode).toBe(200);
    await db.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    const response = await app.inject({ method: 'GET', url: '/organizador', headers: { cookie } });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/entrar');
    expect(response.headers['set-cookie']).toBe(CLEAR);
  });

  it('cookie com assinatura adulterada ou de outro SESSION_SECRET é tratado como visitante', async () => {
    const { app } = await createTestApp();
    const { organizadorB } = await seedAccounts();
    const token = await createSession(app.db, organizadorB.id);
    const valores = [
      `${token}.${'A'.repeat(43)}`,
      token,
      `${token}.`,
      signToken(token, 'outro-segredo-de-sessao-com-32-caracteres-ou-mais'),
    ];
    for (const valor of valores) {
      const response = await app.inject({
        method: 'GET',
        url: '/organizador',
        headers: { cookie: `catraca_sessao=${valor}` },
      });
      expect(response.statusCode, valor).toBe(302);
      expect(response.headers.location, valor).toBe('/entrar');
      expect(response.headers['set-cookie'], valor).toBe(CLEAR);
    }
  });

  it('trocar o SESSION_SECRET invalida as sessões existentes', async () => {
    const { organizadorB } = await seedAccounts();
    const original = await createTestApp();
    const cookie = await sessionCookieFor(original.app, organizadorB.id);
    expect((await original.app.inject({ method: 'GET', url: '/organizador', headers: { cookie } })).statusCode).toBe(
      200,
    );
    const { app } = await createTestApp({
      config: { SESSION_SECRET: 'outro-segredo-de-sessao-com-32-caracteres-ou-mais' },
    });
    const response = await app.inject({ method: 'GET', url: '/organizador', headers: { cookie } });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/entrar');
  });

  it('papel é lido do banco a cada requisição', async () => {
    const { app, db } = await createTestApp();
    const { participante } = await seedAccounts();
    const cookie = await loginAs(app, 'participante@catraca.test');
    expect((await app.inject({ method: 'GET', url: '/organizador', headers: { cookie } })).statusCode).toBe(403);
    await db.query("UPDATE users SET role = 'organizador', name = 'Promovido' WHERE id = $1", [participante.id]);
    const promovido = await app.inject({ method: 'GET', url: '/organizador', headers: { cookie } });
    expect(promovido.statusCode).toBe(200);
    expect(promovido.body).toContain('<span class="nav-usuario">Promovido</span>');
    await db.query("UPDATE users SET role = 'participante' WHERE id = $1", [participante.id]);
    expect((await app.inject({ method: 'GET', url: '/organizador', headers: { cookie } })).statusCode).toBe(403);
  });

  it('/health ignora o cookie de sessão', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { cookie: 'catraca_sessao=invalido' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('páginas HTML de quem está logado levam cache-control no-store', async () => {
    const { app } = await createTestApp();
    const { participante } = await seedAccounts();
    const cookie = await sessionCookieFor(app, participante.id);

    const logado = await app.inject({ method: 'GET', url: '/', headers: { cookie } });
    expect(logado.statusCode).toBe(200);
    expect(logado.headers['cache-control']).toBe('no-store');
    expect(logado.headers['set-cookie']).toBeUndefined();

    const visitante = await app.inject({ method: 'GET', url: '/' });
    expect(visitante.statusCode).toBe(200);
    expect(visitante.headers['cache-control']).toBeUndefined();
  });
});
