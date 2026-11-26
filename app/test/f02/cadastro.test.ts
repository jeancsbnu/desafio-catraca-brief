import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { CREATE_COOKIE, postForm, sessionCookieOf, setCookies } from './support.js';

async function countUsers(db: Awaited<ReturnType<typeof createTestApp>>['db']): Promise<number> {
  const { rows } = await db.query<{ total: number }>('SELECT count(*) AS total FROM users');
  return rows[0]?.total ?? -1;
}

describe('F02 cadastro', () => {
  it('F02-CA01 cadastro válido cria participante, abre sessão e redireciona para /', async () => {
    const { app, db } = await createTestApp();
    const response = await postForm(app, '/cadastro', { nome: 'Ana Souza', email: 'ana@example.com', senha: 'segredo123' });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/');
    expect(setCookies(response)).toHaveLength(1);
    expect(setCookies(response)[0]).toMatch(CREATE_COOKIE);

    const users = await db.query<{ id: string; name: string; email: string; role: string }>(
      "SELECT id, name, email, role FROM users WHERE email = 'ana@example.com'",
    );
    expect(users.rows).toHaveLength(1);
    expect(users.rows[0]).toMatchObject({ name: 'Ana Souza', role: 'participante' });
    expect(users.rows[0]?.id).toMatch(/^usr_[a-z0-9]{16}$/);
    const sessions = await db.query('SELECT 1 FROM sessions WHERE user_id = $1', [users.rows[0]?.id]);
    expect(sessions.rowCount).toBe(1);
  });

  it('F02-CA01 depois do cadastro o topo mostra o nome, Meus ingressos e Sair', async () => {
    const { app } = await createTestApp();
    const created = await postForm(app, '/cadastro', { nome: 'Ana Souza', email: 'ana@example.com', senha: 'segredo123' });
    const page = await app.inject({ method: 'GET', url: '/', headers: { cookie: sessionCookieOf(created) } });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain(
      '<span class="nav-conta"><span class="nav-usuario">Ana Souza</span> <a href="/meus-ingressos">Meus ingressos</a> <form method="post" action="/sair" style="display:inline"><button type="submit">Sair</button></form></span>',
    );
    expect(page.body).not.toContain('<a href="/entrar">Entrar</a>');
    expect(page.body).not.toContain('<a href="/cadastro">Criar conta</a>');
  });

  it('F02-CA01 senha de exatamente 8 caracteres é aceita', async () => {
    const { app } = await createTestApp();
    const response = await postForm(app, '/cadastro', { nome: 'Oito', email: 'oito@example.com', senha: '12345678' });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/');
  });

  it('F02-CA01 senha guardada como hash scrypt e ausente da resposta', async () => {
    const { app, db } = await createTestApp();
    const senha = 'Senha-Secreta-Unica-42';
    const created = await postForm(app, '/cadastro', { nome: 'Bia', email: 'bia@example.com', senha });
    expect(created.body).not.toContain(senha);
    const { rows } = await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE email = 'bia@example.com'",
    );
    expect(rows[0]?.password_hash.startsWith('scrypt$')).toBe(true);
    expect(rows[0]?.password_hash).not.toContain(senha);

    const erro = await postForm(app, '/cadastro', { nome: 'Bia', email: 'bia@example.com', senha });
    expect(erro.statusCode).toBe(422);
    expect(erro.body).not.toContain(senha);
    const home = await app.inject({ method: 'GET', url: '/', headers: { cookie: sessionCookieOf(created) } });
    expect(home.body).not.toContain(senha);
  });

  it('F02-CA02 e-mail da seed com outras maiúsculas é rejeitado com E-mail já cadastrado', async () => {
    const { app, db } = await createTestApp();
    await seedAccounts();
    const antes = await countUsers(db);
    for (const email of ['PARTICIPANTE@catraca.test', 'Organizador.A@Catraca.Test']) {
      const response = await postForm(app, '/cadastro', { nome: 'Outra Pessoa', email, senha: 'outrasenha123' });
      expect(response.statusCode).toBe(422);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers.location).toBeUndefined();
      expect(response.body.split('E-mail já cadastrado')).toHaveLength(2);
      expect(response.body).toContain('value="Outra Pessoa"');
      expect(response.body).toContain(`value="${email}"`);
      expect(response.body).not.toContain('outrasenha123');
    }
    expect(await countUsers(db)).toBe(antes);
    const { rows } = await db.query<{ email: string; role: string; name: string }>(
      "SELECT lower(email) AS email, role, name FROM users WHERE lower(email) IN ('participante@catraca.test', 'organizador.a@catraca.test') ORDER BY 1",
    );
    expect(rows).toEqual([
      { email: 'organizador.a@catraca.test', role: 'organizador', name: 'Organizador A' },
      { email: 'participante@catraca.test', role: 'participante', name: 'Participante' },
    ]);
  });

  it('F02-CA02 cadastros simultâneos com o mesmo e-mail criam uma única conta', async () => {
    const { app, db } = await createTestApp();
    const responses = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        postForm(app, '/cadastro', { nome: `Pessoa ${n}`, email: n % 2 === 0 ? 'Corrida@Example.com' : 'corrida@example.com', senha: 'senha-corrida' }),
      ),
    );
    const statuses = responses.map((response) => response.statusCode).sort();
    expect(statuses).toEqual([302, 422, 422, 422, 422]);
    for (const response of responses.filter((r) => r.statusCode === 422)) {
      expect(response.body).toContain('E-mail já cadastrado');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    const { rows } = await db.query<{ total: number }>(
      "SELECT count(*) AS total FROM users WHERE lower(email) = 'corrida@example.com'",
    );
    expect(rows[0]?.total).toBe(1);
  });

  it('F02-CA03 senha de 7 caracteres é rejeitada', async () => {
    const { app, db } = await createTestApp();
    const response = await postForm(app, '/cadastro', { nome: 'Curta', email: 'curta@example.com', senha: '1234567' });
    expect(response.statusCode).toBe(422);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body.split('A senha precisa ter pelo menos 8 caracteres')).toHaveLength(2);
    expect(await countUsers(db)).toBe(0);
  });

  it('F02-CA03 e-mail mal formado é rejeitado', async () => {
    const { app, db } = await createTestApp();
    for (const email of ['nao-e-um-email', 'a@b', 'a b@c.d', '', '   ', 'a@b@c.d', `${'a'.repeat(250)}@b.cd`, 'a\u0000@b.cd']) {
      const response = await postForm(app, '/cadastro', { nome: 'Nome', email, senha: 'senha-valida-1' });
      expect(response.statusCode, JSON.stringify(email)).toBe(422);
      expect(response.body.split('Informe um e-mail válido')).toHaveLength(2);
    }
    expect(await countUsers(db)).toBe(0);
  });

  it('F02-CA03 nome vazio ou só com espaços é rejeitado', async () => {
    const { app, db } = await createTestApp();
    for (const nome of ['', '   ', 'a\u0000b']) {
      const response = await postForm(app, '/cadastro', { nome, email: 'semnome@example.com', senha: 'senha-valida-1' });
      expect(response.statusCode).toBe(422);
      expect(response.body.split('Informe o nome')).toHaveLength(2);
    }
    const semCampo = await postForm(app, '/cadastro', { email: 'semnome@example.com', senha: 'senha-valida-1' });
    expect(semCampo.statusCode).toBe(422);
    expect(semCampo.body).toContain('Informe o nome');
    expect(await countUsers(db)).toBe(0);
  });

  it('nome com mais de 100 caracteres é rejeitado', async () => {
    const { app, db } = await createTestApp();
    const longo = await postForm(app, '/cadastro', { nome: 'n'.repeat(101), email: 'longo@example.com', senha: 'senha-valida-1' });
    expect(longo.statusCode).toBe(422);
    expect(longo.body).toContain('O nome pode ter no máximo 100 caracteres');
    // 100 pontos de código (emoji ocupa 2 unidades UTF-16) é aceito.
    const limite = await postForm(app, '/cadastro', { nome: `  ${'😀'.repeat(100)}  `, email: 'limite@example.com', senha: 'senha-valida-1' });
    expect(limite.statusCode).toBe(302);
    expect(await countUsers(db)).toBe(1);
  });

  it('erros aparecem antes do formulário na ordem dos campos e mantêm nome e e-mail, nunca a senha', async () => {
    const { app } = await createTestApp();
    const response = await postForm(app, '/cadastro', { nome: '', email: 'x <y>"z', senha: 'curta' });
    expect(response.statusCode).toBe(422);
    const body = response.body;
    const nome = body.indexOf('<p class="msg msg-error" role="alert">Informe o nome</p>');
    const email = body.indexOf('<p class="msg msg-error" role="alert">Informe um e-mail válido</p>');
    const senha = body.indexOf('<p class="msg msg-error" role="alert">A senha precisa ter pelo menos 8 caracteres</p>');
    const form = body.indexOf('<form method="post" action="/cadastro">');
    expect(nome).toBeGreaterThan(-1);
    expect(email).toBeGreaterThan(nome);
    expect(senha).toBeGreaterThan(email);
    expect(form).toBeGreaterThan(senha);
    expect(body.indexOf('<h1>Criar conta</h1>')).toBeGreaterThan(senha);
    expect(body).toContain('value="x &lt;y&gt;&quot;z"');
    expect(body).toContain('<input id="senha" name="senha" type="password" autocomplete="new-password">');
    expect(body).not.toContain('value="curta"');

    const mantidos = await postForm(app, '/cadastro', { nome: 'Ana', email: 'ana@example.com', senha: '123' });
    expect(mantidos.body).toContain('<input id="nome" name="nome" type="text" value="Ana" autocomplete="name">');
    expect(mantidos.body).toContain(
      '<input id="email" name="email" type="text" inputmode="email" value="ana@example.com" autocomplete="email">',
    );
  });

  it('F02-CA07 campos extras papel e role não criam organizador', async () => {
    const { app, db } = await createTestApp();
    const response = await postForm(app, '/cadastro', {
      nome: 'Caio',
      email: 'caio@example.com',
      senha: 'senha-caio-1',
      papel: 'organizador',
      role: 'organizador',
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/');
    const { rows } = await db.query<{ role: string }>("SELECT role FROM users WHERE email = 'caio@example.com'");
    expect(rows).toEqual([{ role: 'participante' }]);
    const area = await app.inject({ method: 'GET', url: '/organizador', headers: { cookie: sessionCookieOf(response) } });
    expect(area.statusCode).toBe(403);
    expect(area.body).toContain('<h1>Acesso negado</h1>');
  });

  it('nome com HTML aparece escapado no topo', async () => {
    const { app } = await createTestApp();
    const created = await postForm(app, '/cadastro', { nome: '<b>Zé</b>', email: 'ze@example.com', senha: 'senha-do-ze' });
    const page = await app.inject({ method: 'GET', url: '/', headers: { cookie: sessionCookieOf(created) } });
    expect(page.body).toContain('<span class="nav-usuario">&lt;b&gt;Zé&lt;/b&gt;</span>');
    expect(page.body).not.toContain('<b>Zé</b>');
  });

  it('GET /cadastro com sessão redireciona para a área do usuário', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const participante = await loginAs(app, 'participante@catraca.test');
    const p = await app.inject({ method: 'GET', url: '/cadastro', headers: { cookie: participante } });
    expect(p.statusCode).toBe(302);
    expect(p.headers.location).toBe('/');
    const organizador = await loginAs(app, 'organizador.a@catraca.test');
    const o = await app.inject({ method: 'GET', url: '/cadastro', headers: { cookie: organizador } });
    expect(o.statusCode).toBe(302);
    expect(o.headers.location).toBe('/organizador');
  });

  it('GET /cadastro mostra o formulário sem validação do navegador', async () => {
    const { app } = await createTestApp();
    const page = await app.inject({ method: 'GET', url: '/cadastro' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<title>Criar conta · Catraca</title>');
    expect(page.body).toContain('<form method="post" action="/cadastro">');
    expect(page.body).toContain('<label for="nome">Nome</label>');
    expect(page.body).toContain('<label for="email">E-mail</label>');
    expect(page.body).toContain('<label for="senha">Senha</label>');
    expect(page.body).toContain('<button type="submit">Criar conta</button>');
    expect(page.body).toContain('<p>Já tem conta? <a href="/entrar">Entrar</a></p>');
    expect(page.body).not.toMatch(/required|minlength|type="email"/);
  });

  it('cadastro com sessão aberta substitui a sessão anterior', async () => {
    const { app, db } = await createTestApp();
    await seedAccounts();
    const antiga = await loginAs(app, 'participante@catraca.test');
    const response = await postForm(app, '/cadastro', { nome: 'Nova', email: 'nova@example.com', senha: 'senha-nova-1' }, { cookie: antiga });
    expect(response.statusCode).toBe(302);
    const { rows } = await db.query<{ email: string }>(
      'SELECT u.email FROM sessions s JOIN users u ON u.id = s.user_id ORDER BY 1',
    );
    expect(rows).toEqual([{ email: 'nova@example.com' }]);
  });
});
