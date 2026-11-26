import { describe, expect, it } from 'vitest';
import { signToken } from '../../src/features/contas/cookie.js';
import { createSession } from '../../src/features/contas/sessions.js';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';

const CLEAR = 'catraca_sessao=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax';

describe('F02 sessão', () => {
  it('sessão vale 12 horas', async () => {
    const { app, db } = await createTestApp();
    const { participante } = await seedAccounts();
    await createSession(app.db, participante.id);
    const { rows } = await db.query<{ seconds: number }>(
      'SELECT round(extract(epoch FROM expires_at - created_at))::int AS seconds FROM sessions WHERE user_id = $1',
      [participante.id],
    );
    expect(rows).toEqual([{ seconds: 43200 }]);
  });

  it('páginas HTML de quem está logado levam cache-control no-store', async () => {
    const { app, config } = await createTestApp();
    const { participante } = await seedAccounts();
    const token = await createSession(app.db, participante.id);
    const cookie = `catraca_sessao=${signToken(token, config.sessionSecret)}`;

    const logado = await app.inject({ method: 'GET', url: '/', headers: { cookie } });
    expect(logado.statusCode).toBe(200);
    expect(logado.headers['cache-control']).toBe('no-store');
    expect(logado.headers['set-cookie']).toBeUndefined();

    const visitante = await app.inject({ method: 'GET', url: '/' });
    expect(visitante.statusCode).toBe(200);
    expect(visitante.headers['cache-control']).toBeUndefined();
  });

  it('cookie com assinatura adulterada ou de outro SESSION_SECRET é descartado e limpo', async () => {
    const { app } = await createTestApp();
    const { participante } = await seedAccounts();
    const token = await createSession(app.db, participante.id);
    const valores = [
      `${token}.${'A'.repeat(43)}`,
      token,
      signToken(token, 'outro-segredo-de-sessao-com-32-caracteres-ou-mais'),
    ];
    for (const valor of valores) {
      const response = await app.inject({ method: 'GET', url: '/', headers: { cookie: `catraca_sessao=${valor}` } });
      expect(response.statusCode).toBe(200);
      expect(response.headers['set-cookie']).toBe(CLEAR);
      expect(response.headers['cache-control']).toBeUndefined();
    }
  });

  it('sessão expirada é descartada e o cookie é limpo', async () => {
    const { app, db, config } = await createTestApp();
    const { participante } = await seedAccounts();
    const token = await createSession(app.db, participante.id);
    await db.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { cookie: `catraca_sessao=${signToken(token, config.sessionSecret)}` },
    });
    expect(response.headers['set-cookie']).toBe(CLEAR);
    expect(response.headers['cache-control']).toBeUndefined();
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
});
