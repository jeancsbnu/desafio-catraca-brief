import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs, sessionCookieFor } from '../helpers/session.js';
import { postForm } from './support.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/features/', import.meta.url));
const AREA = [
  '/organizador',
  '/organizador/',
  '/organizador/eventos/novo',
  '/organizador/eventos/evt_inexistente',
  '/organizador/eventos/evt_x/checkin?codigo=1',
  '/%6Frganizador',
  '/%6Frganizador/eventos',
  '/organizador%2Feventos',
];

describe('F02 proteção das áreas', () => {
  it('F02-CA06 visitante na área do organizador é redirecionado para /entrar', async () => {
    const { app } = await createTestApp();
    for (const url of AREA) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(302);
      expect(response.headers.location, url).toBe('/entrar');
      expect(response.headers['set-cookie'], url).toBeUndefined();
    }
    for (const method of ['POST', 'PUT', 'DELETE'] as const) {
      const response = await app.inject({ method, url: '/organizador/eventos' });
      expect(response.statusCode, method).toBe(302);
      expect(response.headers.location, method).toBe('/entrar');
    }
    const form = await postForm(app, '/organizador/eventos', { nome: 'Evento qualquer' });
    expect(form.statusCode).toBe(302);
    expect(form.headers.location).toBe('/entrar');
  });

  it('F02-CA06 participante na área do organizador recebe 403 Acesso negado', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const cookie = await loginAs(app, 'participante@catraca.test');
    const responses = [
      ...(await Promise.all(AREA.map((url) => app.inject({ method: 'GET', url, headers: { cookie } })))),
      await postForm(app, '/organizador/eventos', { nome: 'Evento qualquer' }, { cookie }),
    ];
    for (const response of responses) {
      expect(response.statusCode).toBe(403);
      expect(response.headers.location).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.body).toContain('<title>Acesso negado · Catraca</title>');
      expect(response.body).toContain('<h1>Acesso negado</h1><p>Esta área é exclusiva para organizadores.</p>');
      expect(response.body).not.toContain('<h1>Área do organizador</h1>');
      expect(response.body).toContain('<span class="nav-usuario">Participante</span>');
    }
  });

  it('organizador abre /organizador e recebe 404 em caminho inexistente da área', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const cookie = await loginAs(app, 'organizador.a@catraca.test');
    const area = await app.inject({ method: 'GET', url: '/organizador', headers: { cookie } });
    expect(area.statusCode).toBe(200);
    expect(area.body).toContain('<title>Área do organizador · Catraca</title>');
    expect(area.body).toContain('<h1>Área do organizador</h1>');
    expect(area.body).toContain('<span class="nav-usuario">Organizador A</span>');
    const inexistente = await app.inject({ method: 'GET', url: '/organizador/nao-existe', headers: { cookie } });
    expect(inexistente.statusCode).toBe(404);
    expect(inexistente.body).toContain('<h1>Página não encontrada</h1>');
  });

  it('/organizadores não é área do organizador', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/organizadores' });
    expect(response.statusCode).toBe(404);
  });

  it('requireParticipant leva o visitante a /entrar com a página de origem', async () => {
    const meus = await (await createTestApp()).app.inject({ method: 'GET', url: '/meus-ingressos' });
    expect(meus.statusCode).toBe(302);
    expect(meus.headers.location).toBe('/entrar?voltar=%2Fmeus-ingressos');

    const { app } = await createTestApp({ featuresDir: FIXTURES });
    const comQuery = await app.inject({ method: 'GET', url: '/teste/participante?x=1&y=2' });
    expect(comQuery.statusCode).toBe(302);
    expect(comQuery.headers.location).toBe('/entrar?voltar=%2Fteste%2Fparticipante%3Fx%3D1%26y%3D2');
  });

  it('requireParticipant em POST usa returnTo ou /entrar', async () => {
    const { app } = await createTestApp({ featuresDir: FIXTURES });
    const comReturnTo = await app.inject({ method: 'POST', url: '/teste/participante-volta' });
    expect(comReturnTo.statusCode).toBe(302);
    expect(comReturnTo.headers.location).toBe('/entrar?voltar=%2Feventos%2Fevt_teste%3Fx%3D1');
    const semReturnTo = await app.inject({ method: 'POST', url: '/teste/participante' });
    expect(semReturnTo.statusCode).toBe(302);
    expect(semReturnTo.headers.location).toBe('/entrar');
  });

  it('requireParticipant barra organizador com 403 ou deixa passar com allowOrganizer', async () => {
    const real = await createTestApp();
    await seedAccounts();
    const organizador = await loginAs(real.app, 'organizador.a@catraca.test');
    const meus = await real.app.inject({ method: 'GET', url: '/meus-ingressos', headers: { cookie: organizador } });
    expect(meus.statusCode).toBe(403);
    expect(meus.body).toContain('<h1>Acesso negado</h1><p>Esta página é exclusiva para participantes.</p>');
    const participante = await loginAs(real.app, 'participante@catraca.test');
    const meusParticipante = await real.app.inject({
      method: 'GET',
      url: '/meus-ingressos',
      headers: { cookie: participante },
    });
    expect(meusParticipante.statusCode).toBe(200);
    expect(meusParticipante.body).toContain('<h1>Meus ingressos</h1>');

    const { app } = await createTestApp({ featuresDir: FIXTURES });
    const permitido = await app.inject({
      method: 'POST',
      url: '/teste/participante-volta',
      headers: { cookie: organizador },
    });
    expect(permitido.statusCode).toBe(200);
    expect(permitido.json()).toMatchObject({ role: 'organizador' });
  });

  it('requireOrganizer fora da área tem o mesmo comportamento do hook', async () => {
    const { app } = await createTestApp({ featuresDir: FIXTURES });
    const { organizadorA, participante } = await seedAccounts();
    const visitante = await app.inject({ method: 'GET', url: '/teste/organizador' });
    expect(visitante.statusCode).toBe(302);
    expect(visitante.headers.location).toBe('/entrar');
    const p = await app.inject({
      method: 'GET',
      url: '/teste/organizador',
      headers: { cookie: await sessionCookieFor(app, participante.id) },
    });
    expect(p.statusCode).toBe(403);
    expect(p.body).toContain('<h1>Acesso negado</h1><p>Esta área é exclusiva para organizadores.</p>');
    const o = await app.inject({
      method: 'GET',
      url: '/teste/organizador',
      headers: { cookie: await sessionCookieFor(app, organizadorA.id) },
    });
    expect(o.statusCode).toBe(200);
    expect(o.json()).toEqual({ id: organizadorA.id, role: 'organizador' });
  });

  it('guarda que bloqueia não deixa o handler executar', async () => {
    const { app } = await createTestApp({ featuresDir: FIXTURES });
    const { organizadorA, participante } = await seedAccounts();
    const p = await sessionCookieFor(app, participante.id);
    const o = await sessionCookieFor(app, organizadorA.id);
    await app.inject({ method: 'GET', url: '/teste/organizador' });
    await app.inject({ method: 'GET', url: '/teste/organizador', headers: { cookie: p } });
    await app.inject({ method: 'GET', url: '/teste/participante' });
    await app.inject({ method: 'GET', url: '/teste/participante', headers: { cookie: o } });
    await app.inject({ method: 'POST', url: '/teste/participante-volta' });
    expect((await app.inject({ method: 'GET', url: '/teste/chamadas' })).json()).toEqual({ calls: 0 });
    await app.inject({ method: 'GET', url: '/teste/participante', headers: { cookie: p } });
    expect((await app.inject({ method: 'GET', url: '/teste/chamadas' })).json()).toEqual({ calls: 1 });
  });

  it('currentUser sem sessão lança erro de programação', async () => {
    const { app } = await createTestApp({ featuresDir: FIXTURES });
    const response = await app.inject({ method: 'GET', url: '/teste/sem-guarda' });
    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('Algo deu errado. Tente novamente.');
    expect(response.body).not.toContain('currentUser');
  });
});
