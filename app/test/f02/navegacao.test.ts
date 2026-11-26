import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';

const VISITANTE =
  '<span class="nav-conta"><a href="/entrar">Entrar</a> <a href="/cadastro">Criar conta</a></span>';
const SAIR = '<form method="post" action="/sair" style="display:inline"><button type="submit">Sair</button></form>';

describe('F02 navegação de conta', () => {
  it('F02-CA01 visitante vê Entrar e Criar conta em /, /entrar, /cadastro e na página 404', async () => {
    const { app } = await createTestApp();
    for (const [url, status] of [
      ['/', 200],
      ['/entrar', 200],
      ['/cadastro', 200],
      ['/pagina-que-nao-existe', 404],
    ] as const) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(status);
      expect(response.body, url).toContain(VISITANTE);
      expect(response.body, url).not.toContain('nav-usuario');
      expect(response.body, url).not.toContain('<button type="submit">Sair</button>');
      expect(response.headers['set-cookie'], url).toBeUndefined();
    }
  });

  it('participante vê nome, Meus ingressos e Sair, sem Entrar nem Área do organizador', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const cookie = await loginAs(app, 'participante@catraca.test');
    for (const [url, status] of [
      ['/', 200],
      ['/pagina-que-nao-existe', 404],
    ] as const) {
      const response = await app.inject({ method: 'GET', url, headers: { cookie } });
      expect(response.statusCode, url).toBe(status);
      expect(response.body, url).toContain(
        `<span class="nav-conta"><span class="nav-usuario">Participante</span> <a href="/meus-ingressos">Meus ingressos</a> ${SAIR}</span>`,
      );
      expect(response.body, url).not.toContain('<a href="/entrar">Entrar</a>');
      expect(response.body, url).not.toContain('<a href="/cadastro">Criar conta</a>');
      expect(response.body, url).not.toContain('href="/organizador"');
    }
  });

  it('organizador vê nome, Área do organizador e Sair', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const cookie = await loginAs(app, 'organizador.a@catraca.test');
    const response = await app.inject({ method: 'GET', url: '/', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(
      `<span class="nav-conta"><span class="nav-usuario">Organizador A</span> <a href="/organizador">Área do organizador</a> ${SAIR}</span>`,
    );
    expect(response.body).not.toContain('href="/meus-ingressos"');
    expect(response.body).not.toContain('<a href="/entrar">Entrar</a>');
  });

  it('a navegação de conta vem depois da marca', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/' });
    const marca = response.body.indexOf('class="marca"');
    expect(marca).toBeGreaterThan(-1);
    expect(response.body.indexOf('class="nav-conta"')).toBeGreaterThan(marca);
  });
});
