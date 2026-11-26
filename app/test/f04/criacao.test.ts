import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { sessionCookieFor } from '../helpers/session.js';
import {
  countEvents,
  createViaHttp,
  eventFields,
  get,
  LOCATION_CREATED,
  occurrences,
  ONTEM,
  postForm,
  PROX,
} from './support.js';

async function setup() {
  const test = await createTestApp();
  const accounts = await seedAccounts();
  const cookieA = await sessionCookieFor(test.app, accounts.organizadorA.id);
  return { ...test, ...accounts, cookieA };
}

describe('F04 criação de evento', () => {
  it('F04-CA01 organizador cria evento que nasce Rascunho com id evt_ e vai para a página de gestão', async () => {
    const { app, db, cookieA, organizadorA } = await setup();
    const response = await postForm(app, '/organizador/eventos', { ...eventFields() }, cookieA);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toMatch(LOCATION_CREATED);
    const id = LOCATION_CREATED.exec(String(response.headers.location))?.[1];
    const { rows } = await db.query(
      `SELECT status, capacity, price_cents, organizer_id, published_at, cancelled_at,
              to_char(starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI') AS inicio
         FROM events WHERE id = $1`,
      [id],
    );
    expect(rows).toEqual([
      {
        status: 'rascunho',
        capacity: 2,
        price_cents: 10000,
        organizer_id: organizadorA.id,
        published_at: null,
        cancelled_at: null,
        inicio: PROX.iso,
      },
    ]);
  });

  it('F04-CA01 a página de gestão mostra Evento criado, status, data, local, lotação e preço', async () => {
    const { app, cookieA } = await setup();
    const id = await createViaHttp(app, cookieA, { nome: 'Jazz no Porão' });
    const page = await get(app, `/organizador/eventos/${id}?ok=criado`, cookieA);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<title>Jazz no Porão · Catraca</title>');
    expect(page.body).toContain('<p class="msg msg-success" role="status">Evento criado</p>');
    expect(page.body).toContain(
      [
        '<h1>Jazz no Porão</h1>',
        '<p>Status: <strong data-status="rascunho">Rascunho</strong></p>',
        '<dl>',
        `<dt>Data e hora de início</dt><dd>${PROX.br}</dd>`,
        '<dt>Local</dt><dd>Bar do Centro</dd>',
        '<dt>Lotação</dt><dd>2</dd>',
        '<dt>Preço</dt><dd>R$ 100,00</dd>',
        '</dl>',
        '<section data-secao="edicao">',
        '<h2>Editar evento</h2>',
        `<form method="post" action="/organizador/eventos/${id}/editar">`,
      ].join('\n'),
    );
    expect(page.body).toContain(
      `<form method="post" action="/organizador/eventos/${id}/publicar"><button type="submit">Publicar</button></form>`,
    );
    expect(page.body).not.toContain('Cancelar evento');
    expect(page.body).not.toContain(`/organizador/eventos/${id}/cancelar`);
    expect(page.body).toContain('<p><a href="/organizador">Voltar para meus eventos</a></p>');

    const plain = await get(app, `/organizador/eventos/${id}`, cookieA);
    expect(plain.body).not.toContain('Evento criado');
    const unknown = await get(app, `/organizador/eventos/${id}?ok=toString`, cookieA);
    expect(unknown.statusCode).toBe(200);
    expect(unknown.body).not.toContain('class="msg');
  });

  it('F04-CA01 o evento aparece na lista de /organizador com nome, data e status', async () => {
    const { app, cookieA } = await setup();
    const id = await createViaHttp(app, cookieA, { nome: 'Show na lista' });
    const list = await get(app, '/organizador', cookieA);
    expect(list.statusCode).toBe(200);
    expect(list.body).toContain('<title>Área do organizador · Catraca</title>');
    expect(list.body).toContain('<h1>Área do organizador</h1>');
    expect(list.body).toContain('<p><a href="/organizador/eventos/novo">Novo evento</a></p>');
    expect(list.body).toContain('<thead><tr><th>Nome</th><th>Data</th><th>Status</th></tr></thead>');
    expect(list.body).toContain(
      `\n<tr><td><a href="/organizador/eventos/${id}">Show na lista</a></td><td>${PROX.br}</td><td>Rascunho</td></tr>\n`,
    );
  });

  it('lista ordenada por data de início', async () => {
    const { app, cookieA } = await setup();
    const later = await createViaHttp(app, cookieA, { nome: 'Depois', inicio: '20/12/2099 20:00' });
    const sooner = await createViaHttp(app, cookieA, { nome: 'Antes', inicio: '19/12/2099 20:00' });
    const body = (await get(app, '/organizador', cookieA)).body;
    expect(body.indexOf(sooner)).toBeGreaterThan(0);
    expect(body.indexOf(sooner)).toBeLessThan(body.indexOf(later));
  });

  it('F04-CA02 data de ontem é rejeitada sem criar evento', async () => {
    const { app, db, cookieA } = await setup();
    for (const inicio of [ONTEM.iso, ONTEM.br]) {
      const response = await postForm(app, '/organizador/eventos', { ...eventFields({ inicio }) }, cookieA);
      expect(response.statusCode, inicio).toBe(422);
      expect(occurrences(response.body, 'A data de início precisa estar no futuro')).toBe(1);
    }
    expect(await countEvents(db)).toBe(0);
  });

  it('F04-CA03 lotação 0 e 1,5 são rejeitadas com a mensagem exata', async () => {
    const { app, db, cookieA } = await setup();
    for (const lotacao of ['0', '1,5']) {
      const response = await postForm(app, '/organizador/eventos', { ...eventFields({ lotacao }) }, cookieA);
      expect(response.statusCode, lotacao).toBe(422);
      expect(occurrences(response.body, 'A lotação precisa ser um número inteiro maior ou igual a 1')).toBe(1);
    }
    expect(await countEvents(db)).toBe(0);
  });

  it('F04-CA03 preço 0,00 é rejeitado com a mensagem exata', async () => {
    const { app, db, cookieA } = await setup();
    const response = await postForm(app, '/organizador/eventos', { ...eventFields({ preco: '0,00' }) }, cookieA);
    expect(response.statusCode).toBe(422);
    expect(occurrences(response.body, 'O preço precisa ser maior que zero')).toBe(1);
    expect(await countEvents(db)).toBe(0);
  });

  it('erros aparecem antes do formulário, na ordem dos campos, com os valores digitados', async () => {
    const { app, db, cookieA } = await setup();
    const typed = { nome: '  ', inicio: ` ${ONTEM.iso}`, local: '', lotacao: '1,5', preco: ' 0,00 ' };
    const response = await postForm(app, '/organizador/eventos', typed, cookieA);
    expect(response.statusCode).toBe(422);
    expect(response.headers.location).toBeUndefined();
    const body = response.body;
    expect(body).toContain('<title>Novo evento · Catraca</title>');
    const positions = [
      'Informe o nome do evento',
      'A data de início precisa estar no futuro',
      'Informe o local do evento',
      'A lotação precisa ser um número inteiro maior ou igual a 1',
      'O preço precisa ser maior que zero',
      '<h1>Novo evento</h1>',
      '<form method="post" action="/organizador/eventos">',
    ].map((text) => body.indexOf(text));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(body).toContain('<p class="msg msg-error" role="alert">Informe o nome do evento</p>');
    expect(body).toContain('<input id="nome" name="nome" type="text" value="  ">');
    expect(body).toContain(`<input id="inicio" name="inicio" type="text" placeholder="DD/MM/AAAA HH:MM" value=" ${ONTEM.iso}">`);
    expect(body).toContain('<input id="lotacao" name="lotacao" type="text" inputmode="numeric" value="1,5">');
    expect(body).toContain('<input id="preco" name="preco" type="text" inputmode="decimal" placeholder="100,00" value=" 0,00 ">');
    expect(await countEvents(db)).toBe(0);

    const empty = await app.inject({ method: 'POST', url: '/organizador/eventos', headers: { cookie: cookieA } });
    expect(empty.statusCode).toBe(422);
    expect(empty.body).toContain('Informe o nome do evento');
    expect(empty.body).toContain('Informe a data e hora de início no formato DD/MM/AAAA HH:MM');
  });

  it('nome e local com HTML aparecem escapados', async () => {
    const { app, cookieA } = await setup();
    const id = await createViaHttp(app, cookieA, { nome: '<b>x</b> & "y"', local: '<i>Bar</i>' });
    for (const url of ['/organizador', `/organizador/eventos/${id}`]) {
      const body = (await get(app, url, cookieA)).body;
      expect(body, url).toContain('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
      expect(body, url).not.toContain('<b>x</b>');
      expect(body, url).not.toContain('<i>Bar</i>');
    }
    const invalid = await postForm(app, '/organizador/eventos', { ...eventFields({ nome: '"><script>', preco: '0' }) }, cookieA);
    expect(invalid.body).toContain('value="&quot;&gt;&lt;script&gt;"');
  });

  it('campos extras não mudam dono nem status', async () => {
    const { app, db, cookieA, organizadorA, organizadorB } = await setup();
    const fields = new URLSearchParams({ ...eventFields() });
    fields.append('organizer_id', organizadorB.id);
    fields.append('status', 'publicado');
    fields.append('id', 'evt_aaaaaaaaaaaaaaaa');
    fields.append('price_cents', '1');
    const response = await postForm(app, '/organizador/eventos', fields, cookieA);
    expect(response.statusCode).toBe(302);
    const id = LOCATION_CREATED.exec(String(response.headers.location))?.[1];
    expect(id).not.toBe('evt_aaaaaaaaaaaaaaaa');
    const { rows } = await db.query('SELECT organizer_id, status, price_cents FROM events WHERE id = $1', [id]);
    expect(rows).toEqual([{ organizer_id: organizadorA.id, status: 'rascunho', price_cents: 10000 }]);
  });

  it('campo repetido vale vazio', async () => {
    const { app, db, cookieA } = await setup();
    const fields = new URLSearchParams({ ...eventFields() });
    fields.append('nome', 'Outro nome');
    const response = await postForm(app, '/organizador/eventos', fields, cookieA);
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('Informe o nome do evento');
    expect(await countEvents(db)).toBe(0);
  });

  it('lista vazia mostra a mensagem e o link Novo evento', async () => {
    const { app, cookieA } = await setup();
    const list = await get(app, '/organizador', cookieA);
    expect(list.statusCode).toBe(200);
    expect(list.body).toContain(
      '<h1>Área do organizador</h1>\n<p><a href="/organizador/eventos/novo">Novo evento</a></p>\n<p>Você ainda não tem eventos.</p>',
    );
    expect(list.body).not.toContain('<table>');
  });

  it('formulário Novo evento tem os cinco campos, Salvar e nenhum atributo de validação do navegador', async () => {
    const { app, cookieA } = await setup();
    const page = await get(app, '/organizador/eventos/novo', cookieA);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<title>Novo evento · Catraca</title>');
    expect(page.body).toContain(
      [
        '<h1>Novo evento</h1>',
        '<form method="post" action="/organizador/eventos">',
        '<label for="nome">Nome</label>',
        '<input id="nome" name="nome" type="text" value="">',
        '<label for="inicio">Data e hora de início</label>',
        '<input id="inicio" name="inicio" type="text" placeholder="DD/MM/AAAA HH:MM" value="">',
        '<small>Horário de Brasília (America/Sao_Paulo).</small>',
        '<label for="local">Local</label>',
        '<input id="local" name="local" type="text" value="">',
        '<label for="lotacao">Lotação</label>',
        '<input id="lotacao" name="lotacao" type="text" inputmode="numeric" value="">',
        '<label for="preco">Preço (R$)</label>',
        '<input id="preco" name="preco" type="text" inputmode="decimal" placeholder="100,00" value="">',
        '<button type="submit">Salvar</button>',
        '</form>',
        '<p><a href="/organizador">Voltar para meus eventos</a></p>',
      ].join('\n'),
    );
    for (const attribute of ['required', 'maxlength', 'min=', 'type="number"', 'type="datetime-local"']) {
      expect(page.body, attribute).not.toContain(attribute);
    }
  });
});
