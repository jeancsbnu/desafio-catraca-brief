import { describe, expect, it } from 'vitest';
import { runSeed, SEED_PASSWORD } from '../../src/db/seed.js';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { postForm } from './support.js';

describe('CF01 contas da seed (F01) entram pelo login (F02)', () => {
  it('CF01 organizador A da seed entra com catraca123 e chega a /organizador', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    expect(SEED_PASSWORD).toBe('catraca123');
    const login = await postForm(app, '/entrar', { email: 'organizador.a@catraca.test', senha: 'catraca123' });
    expect(login.statusCode).toBe(302);
    expect(login.headers.location).toBe('/organizador');
    const cookie = await loginAs(app, 'organizador.a@catraca.test');
    const area = await app.inject({ method: 'GET', url: '/organizador', headers: { cookie } });
    expect(area.statusCode).toBe(200);
    expect(area.body).toContain('<h1>Área do organizador</h1>');
    expect(area.body).toContain('<span class="nav-usuario">Organizador A</span>');
  });

  it('CF01 rodar a seed de novo (nova subida) mantém o login e a sessão existente', async () => {
    const primeira = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const cookie = await loginAs(primeira.app, 'organizador.a@catraca.test');

    // Nova subida: a seed roda de novo (upsert, mesmo id) e a aplicação é recriada.
    await runSeed(primeira.db);
    const { app, db } = await createTestApp();
    const { rows } = await db.query<{ id: string }>("SELECT id FROM users WHERE email = 'organizador.a@catraca.test'");
    expect(rows).toEqual([{ id: organizadorA.id }]);

    const antiga = await app.inject({ method: 'GET', url: '/organizador', headers: { cookie } });
    expect(antiga.statusCode).toBe(200);
    expect(antiga.body).toContain('<h1>Área do organizador</h1>');
    const novo = await postForm(app, '/entrar', { email: 'organizador.a@catraca.test', senha: 'catraca123' });
    expect(novo.statusCode).toBe(302);
    expect(novo.headers.location).toBe('/organizador');
  });
});
