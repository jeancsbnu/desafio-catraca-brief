import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { CREATE_COOKIE, postForm, setCookies } from './support.js';

const SENHA = 'catraca123';

describe('F02 login', () => {
  it('F02-CA04 organizador A da seed vai para /organizador', async () => {
    const { app, db } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const response = await postForm(app, '/entrar', { email: 'organizador.a@catraca.test', senha: SENHA });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/organizador');
    expect(setCookies(response)).toHaveLength(1);
    expect(setCookies(response)[0]).toMatch(CREATE_COOKIE);
    const sessions = await db.query('SELECT 1 FROM sessions WHERE user_id = $1', [organizadorA.id]);
    expect(sessions.rowCount).toBe(1);
  });

  it('F02-CA04 participante da seed vai para a vitrine', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const response = await postForm(app, '/entrar', { email: 'participante@catraca.test', senha: SENHA });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/');
    expect(setCookies(response)[0]).toMatch(CREATE_COOKIE);
  });

  it('F02-CA04 senha errada e e-mail inexistente mostram a mesma mensagem', async () => {
    const { app, db } = await createTestApp();
    await seedAccounts();
    const errada = await postForm(app, '/entrar', { email: 'organizador.a@catraca.test', senha: 'senha-errada-9' });
    const inexistente = await postForm(app, '/entrar', { email: 'naoexiste@example.com', senha: SENHA });
    for (const response of [errada, inexistente]) {
      expect(response.statusCode).toBe(422);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers.location).toBeUndefined();
      expect(response.body.split('E-mail ou senha inválidos')).toHaveLength(2);
      expect(response.body.match(/class="msg msg-error"/g)).toHaveLength(1);
      expect(response.body).not.toContain('Informe');
      expect(response.body).not.toContain('já cadastrado');
    }
    expect(errada.body).toContain('value="organizador.a@catraca.test"');
    expect(errada.body).not.toContain('senha-errada-9');
    const sessions = await db.query('SELECT 1 FROM sessions');
    expect(sessions.rowCount).toBe(0);
  });

  it('campos vazios mostram a mesma mensagem', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const cases: Record<string, string>[] = [
      { email: '', senha: '' },
      { email: 'participante@catraca.test', senha: '' },
      { email: '', senha: SENHA },
      {},
    ];
    for (const fields of cases) {
      const response = await postForm(app, '/entrar', fields);
      expect(response.statusCode).toBe(422);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.body.split('E-mail ou senha inválidos')).toHaveLength(2);
    }
  });

  it('e-mail é comparado sem diferenciar maiúsculas e sem espaços nas pontas', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const response = await postForm(app, '/entrar', { email: ' ORGANIZADOR.A@CATRACA.TEST ', senha: SENHA });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/organizador');
    const espacoNaSenha = await postForm(app, '/entrar', { email: 'participante@catraca.test', senha: ` ${SENHA}` });
    expect(espacoNaSenha.statusCode).toBe(422);
  });

  it('participante volta ao voltar válido e organizador ignora o voltar', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const participante = await postForm(app, '/entrar', {
      email: 'participante@catraca.test',
      senha: SENHA,
      voltar: '/meus-ingressos',
    });
    expect(participante.statusCode).toBe(302);
    expect(participante.headers.location).toBe('/meus-ingressos');
    const comQuery = await postForm(app, '/entrar', {
      email: 'participante@catraca.test',
      senha: SENHA,
      voltar: '/eventos/evt_exemplo?origem=f02',
    });
    expect(comQuery.headers.location).toBe('/eventos/evt_exemplo?origem=f02');
    const organizador = await postForm(app, '/entrar', {
      email: 'organizador.a@catraca.test',
      senha: SENHA,
      voltar: '/meus-ingressos',
    });
    expect(organizador.headers.location).toBe('/organizador');
  });

  it('voltar malicioso leva à vitrine', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const maliciosos = [
      'https://evil.example/',
      '//evil.example/x',
      '/\\evil.example',
      '/\t/evil.example',
      'javascript:alert(1)',
      'http:/evil.example',
      '/entrar',
      '/.//evil.example',
    ];
    for (const voltar of maliciosos) {
      const response = await postForm(app, '/entrar', { email: 'participante@catraca.test', senha: SENHA, voltar });
      expect(response.statusCode, voltar).toBe(302);
      expect(response.headers.location, voltar).toBe('/');
    }
    const repetido = await postForm(
      app,
      '/entrar',
      new URLSearchParams([
        ['email', 'participante@catraca.test'],
        ['senha', SENHA],
        ['voltar', '/a'],
        ['voltar', '/b'],
      ]),
    );
    expect(repetido.headers.location).toBe('/');
  });

  it('formulário de login guarda o voltar válido e descarta o inválido', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const valido = await app.inject({ method: 'GET', url: '/entrar?voltar=%2Fmeus-ingressos' });
    expect(valido.statusCode).toBe(200);
    expect(valido.body.split('<input type="hidden" name="voltar" value="/meus-ingressos">')).toHaveLength(2);

    const invalido = await app.inject({ method: 'GET', url: '/entrar?voltar=https%3A%2F%2Fevil.example%2F' });
    expect(invalido.statusCode).toBe(200);
    expect(invalido.body).not.toContain('evil.example');
    expect(invalido.body).not.toContain('name="voltar"');

    const falhou = await postForm(app, '/entrar', {
      email: 'participante@catraca.test',
      senha: 'errada-123',
      voltar: '/eventos/evt_1?a=1&b=2',
    });
    expect(falhou.statusCode).toBe(422);
    expect(falhou.body).toContain('<input type="hidden" name="voltar" value="/eventos/evt_1?a=1&amp;b=2">');

    const falhouMalicioso = await postForm(app, '/entrar', {
      email: 'participante@catraca.test',
      senha: 'errada-123',
      voltar: '//evil.example/x',
    });
    expect(falhouMalicioso.body).not.toContain('evil.example');
  });

  it('GET /entrar mostra o formulário de login', async () => {
    const { app } = await createTestApp();
    const page = await app.inject({ method: 'GET', url: '/entrar' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<title>Entrar · Catraca</title>');
    expect(page.body).toContain('<h1>Entrar</h1>');
    expect(page.body).toContain('<form method="post" action="/entrar">');
    expect(page.body).toContain(
      '<input id="email" name="email" type="text" inputmode="email" value="" autocomplete="username">',
    );
    expect(page.body).toContain('<input id="senha" name="senha" type="password" autocomplete="current-password">');
    expect(page.body).toContain('<button type="submit">Entrar</button>');
    expect(page.body).toContain('<p>Não tem conta? <a href="/cadastro">Criar conta</a></p>');
    expect(page.body).not.toContain('name="voltar"');
  });

  it('novo login substitui a sessão anterior', async () => {
    const { app, db } = await createTestApp();
    const { participante } = await seedAccounts();
    const antiga = await loginAs(app, 'participante@catraca.test');
    const nova = await postForm(app, '/entrar', { email: 'participante@catraca.test', senha: SENHA }, { cookie: antiga });
    expect(nova.statusCode).toBe(302);
    expect(setCookies(nova)).toHaveLength(1);
    expect(setCookies(nova)[0]).toMatch(CREATE_COOKIE);
    const { rows } = await db.query<{ total: number }>('SELECT count(*) AS total FROM sessions WHERE user_id = $1', [
      participante.id,
    ]);
    expect(rows[0]?.total).toBe(1);
    const comAntiga = await app.inject({ method: 'GET', url: '/', headers: { cookie: antiga } });
    expect(comAntiga.body).toContain('<a href="/entrar">Entrar</a>');
  });

  it('GET /entrar com sessão redireciona', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const participante = await loginAs(app, 'participante@catraca.test');
    const comVoltar = await app.inject({
      method: 'GET',
      url: '/entrar?voltar=%2Fmeus-ingressos',
      headers: { cookie: participante },
    });
    expect(comVoltar.statusCode).toBe(302);
    expect(comVoltar.headers.location).toBe('/meus-ingressos');
    const semVoltar = await app.inject({ method: 'GET', url: '/entrar', headers: { cookie: participante } });
    expect(semVoltar.headers.location).toBe('/');
    const organizador = await loginAs(app, 'organizador.a@catraca.test');
    const o = await app.inject({
      method: 'GET',
      url: '/entrar?voltar=%2Fmeus-ingressos',
      headers: { cookie: organizador },
    });
    expect(o.statusCode).toBe(302);
    expect(o.headers.location).toBe('/organizador');
  });

  it('login com cookie inválido substitui a limpeza pelo cookie novo', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const response = await postForm(
      app,
      '/entrar',
      { email: 'participante@catraca.test', senha: SENHA },
      { cookie: 'catraca_sessao=lixo' },
    );
    expect(response.statusCode).toBe(302);
    expect(setCookies(response)).toHaveLength(1);
    expect(setCookies(response)[0]).toMatch(CREATE_COOKIE);
  });
});
