import { describe, expect, it } from 'vitest';
// Módulos de F01–F04 (sem o ingressos da F05, que registra o próprio tratador/provedor).
import { createBaseTestApp as createTestApp } from '../helpers/base-features.js';
import { seedAccounts } from '../helpers/seed.js';
import { sessionCookieFor } from '../helpers/session.js';
import { createViaHttp, DEPOIS, eventFields, get, occurrences, ONTEM, postEmpty, postForm, PROX, snapshot } from './support.js';

async function setup(options: { occupied?: number } = {}) {
  const test = await createTestApp();
  const calls: { eventId: string; lockedElsewhere: string | undefined; inTransaction: boolean }[] = [];
  if (options.occupied !== undefined) {
    const occupied = options.occupied;
    test.app.events.setOccupiedSeatsProvider(async (client, eventId) => {
      // Outra conexão não consegue travar a linha: ela já está travada pela transação da edição.
      const other = await test.db.connect();
      let lockedElsewhere: string | undefined;
      try {
        await other.query('SELECT id FROM events WHERE id = $1 FOR UPDATE NOWAIT', [eventId]);
        lockedElsewhere = 'livre';
      } catch (error) {
        lockedElsewhere = (error as { code?: string }).code;
      } finally {
        other.release();
      }
      const { rows } = await client.query<{ tx: string | null }>('SELECT txid_current_if_assigned()::text AS tx');
      calls.push({ eventId, lockedElsewhere, inTransaction: rows[0]?.tx !== null });
      return occupied;
    });
  }
  const accounts = await seedAccounts();
  const cookieA = await sessionCookieFor(test.app, accounts.organizadorA.id);
  return { ...test, ...accounts, cookieA, calls };
}

describe('F04 edição de evento', () => {
  it('F04-CA02 editar para data passada é rejeitado e nada muda', async () => {
    const { app, db, cookieA } = await setup();
    const id = await createViaHttp(app, cookieA);
    for (const step of ['rascunho', 'publicado']) {
      if (step === 'publicado') {
        const published = await postEmpty(app, `/organizador/eventos/${id}/publicar`, cookieA);
        expect(published.statusCode).toBe(302);
      }
      const before = await snapshot(db, id);
      const response = await postForm(app, `/organizador/eventos/${id}/editar`, { ...eventFields({ inicio: ONTEM.iso }) }, cookieA);
      expect(response.statusCode, step).toBe(422);
      expect(occurrences(response.body, 'A data de início precisa estar no futuro'), step).toBe(1);
      expect(response.body).toContain(`<dt>Data e hora de início</dt><dd>${PROX.br}</dd>`);
      expect(response.body).toContain(`value="${ONTEM.iso}"`);
      expect(await snapshot(db, id), step).toBe(before);
    }
  });

  it('F04-CA05 evento publicado sem compras aceita preço R$ 150,00 e lotação 3', async () => {
    const { app, db, cookieA } = await setup();
    const id = await createViaHttp(app, cookieA);
    expect((await postEmpty(app, `/organizador/eventos/${id}/publicar`, cookieA)).statusCode).toBe(302);
    const before = await db.query<{ updated_at: Date }>('SELECT updated_at FROM events WHERE id = $1', [id]);
    const response = await postForm(app, `/organizador/eventos/${id}/editar`, { ...eventFields({ lotacao: '3', preco: '150,00' }) }, cookieA);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`/organizador/eventos/${id}?ok=atualizado`);
    const page = await get(app, `/organizador/eventos/${id}?ok=atualizado`, cookieA);
    expect(page.body).toContain('<p class="msg msg-success" role="status">Evento atualizado</p>');
    expect(page.body).toContain('<dt>Preço</dt><dd>R$ 150,00</dd>');
    expect(page.body).toContain('<dt>Lotação</dt><dd>3</dd>');
    expect(page.body).toContain('value="150,00"');
    expect(page.body).toContain('value="3"');
    expect(page.body).toContain('<strong data-status="publicado">Publicado</strong>');
    const { rows } = await db.query<{ status: string; capacity: number; price_cents: number; updated_at: Date }>(
      'SELECT status, capacity, price_cents, updated_at FROM events WHERE id = $1',
      [id],
    );
    expect(rows[0]).toMatchObject({ status: 'publicado', capacity: 3, price_cents: 15000 });
    expect(rows[0]?.updated_at.getTime()).toBeGreaterThan(before.rows[0]?.updated_at.getTime() ?? Infinity);
  });

  it('F04-CA05 rascunho também pode ser editado', async () => {
    const { app, db, cookieA } = await setup();
    const id = await createViaHttp(app, cookieA);
    const response = await postForm(
      app,
      `/organizador/eventos/${id}/editar`,
      { nome: '  Novo nome ', inicio: DEPOIS.br, local: 'Outro local', lotacao: '10', preco: 'R$ 42,5' },
      cookieA,
    );
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`/organizador/eventos/${id}?ok=atualizado`);
    const { rows } = await db.query(
      `SELECT name, location, capacity, price_cents, status,
              to_char(starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI') AS inicio
         FROM events WHERE id = $1`,
      [id],
    );
    expect(rows).toEqual([
      { name: 'Novo nome', location: 'Outro local', capacity: 10, price_cents: 4250, status: 'rascunho', inicio: DEPOIS.iso },
    ]);
  });

  it('lotação abaixo das vagas ocupadas do provedor é rejeitada e nada muda', async () => {
    const { app, db, cookieA, calls } = await setup({ occupied: 5 });
    const id = await createViaHttp(app, cookieA, { lotacao: '8' });
    expect((await postEmpty(app, `/organizador/eventos/${id}/publicar`, cookieA)).statusCode).toBe(302);
    const before = await snapshot(db, id);
    const below = await postForm(app, `/organizador/eventos/${id}/editar`, { ...eventFields({ nome: 'Mudou', lotacao: '4' }) }, cookieA);
    expect(below.statusCode).toBe(422);
    expect(occurrences(below.body, 'A lotação não pode ficar menor que as vagas ocupadas')).toBe(1);
    expect(below.body).toContain('<p class="msg msg-error" role="alert">A lotação não pode ficar menor que as vagas ocupadas</p>');
    expect(below.body).toContain('<dt>Lotação</dt><dd>8</dd>');
    expect(below.body).toContain('<input id="lotacao" name="lotacao" type="text" inputmode="numeric" value="4">');
    expect(below.body).toContain('<input id="nome" name="nome" type="text" value="Mudou">');
    expect(await snapshot(db, id)).toBe(before);

    for (const lotacao of ['5', '6']) {
      const ok = await postForm(app, `/organizador/eventos/${id}/editar`, { ...eventFields({ lotacao }) }, cookieA);
      expect(ok.statusCode, lotacao).toBe(302);
      const { rows } = await db.query<{ capacity: number }>('SELECT capacity FROM events WHERE id = $1', [id]);
      expect(rows[0]?.capacity).toBe(Number(lotacao));
    }
    expect(calls.map((call) => call.eventId)).toEqual([id, id, id]);
  });

  it('provedor de vagas é chamado com a linha do evento travada, na transação da edição', async () => {
    const { app, cookieA, calls } = await setup({ occupied: 0 });
    const id = await createViaHttp(app, cookieA);
    const response = await postForm(app, `/organizador/eventos/${id}/editar`, { ...eventFields({ lotacao: '1' }) }, cookieA);
    expect(response.statusCode).toBe(302);
    expect(calls).toEqual([{ eventId: id, lockedElsewhere: '55P03', inTransaction: true }]);
  });

  it('sem provedor registrado as vagas ocupadas são zero', async () => {
    const { app, db, cookieA } = await setup();
    const id = await createViaHttp(app, cookieA, { lotacao: '5' });
    const response = await postForm(app, `/organizador/eventos/${id}/editar`, { ...eventFields({ lotacao: '1' }) }, cookieA);
    expect(response.statusCode).toBe(302);
    const { rows } = await db.query<{ capacity: number }>('SELECT capacity FROM events WHERE id = $1', [id]);
    expect(rows[0]?.capacity).toBe(1);
  });

  it('erro de validação na edição mostra a página de gestão com os valores guardados e os digitados', async () => {
    const { app, db, cookieA } = await setup();
    const id = await createViaHttp(app, cookieA, { nome: 'Original', lotacao: '2', preco: '100,00' });
    const before = await snapshot(db, id);
    const response = await postForm(
      app,
      `/organizador/eventos/${id}/editar`,
      { nome: 'Novo', inicio: PROX.br, local: '', lotacao: '1,5', preco: '0,00' },
      cookieA,
    );
    expect(response.statusCode).toBe(422);
    const body = response.body;
    expect(body).toContain('<title>Original · Catraca</title>');
    const order = [
      'Informe o local do evento',
      'A lotação precisa ser um número inteiro maior ou igual a 1',
      'O preço precisa ser maior que zero',
      '<h1>Original</h1>',
      '<dt>Lotação</dt><dd>2</dd>',
      '<input id="nome" name="nome" type="text" value="Novo">',
      '<input id="lotacao" name="lotacao" type="text" inputmode="numeric" value="1,5">',
      '<input id="preco" name="preco" type="text" inputmode="decimal" placeholder="100,00" value="0,00">',
      '<button type="submit">Salvar alterações</button>',
      '<button type="submit">Publicar</button>',
    ].map((text) => body.indexOf(text));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const text of ['Informe o local do evento', 'O preço precisa ser maior que zero', 'Salvar alterações']) {
      expect(occurrences(body, text), text).toBe(1);
    }
    expect(await snapshot(db, id)).toBe(before);
  });

  it('a página de gestão pré-preenche o formulário de edição com os valores guardados', async () => {
    const { app, cookieA } = await setup();
    const id = await createViaHttp(app, cookieA, { nome: 'Pré', inicio: DEPOIS.iso, local: 'Lugar', lotacao: '007', preco: '1234,5' });
    const body = (await get(app, `/organizador/eventos/${id}`, cookieA)).body;
    expect(body).toContain(
      [
        '<input id="nome" name="nome" type="text" value="Pré">',
        '<label for="inicio">Data e hora de início</label>',
        `<input id="inicio" name="inicio" type="text" placeholder="DD/MM/AAAA HH:MM" value="${DEPOIS.br}">`,
        '<small>Horário de Brasília (America/Sao_Paulo).</small>',
        '<label for="local">Local</label>',
        '<input id="local" name="local" type="text" value="Lugar">',
        '<label for="lotacao">Lotação</label>',
        '<input id="lotacao" name="lotacao" type="text" inputmode="numeric" value="7">',
        '<label for="preco">Preço (R$)</label>',
        '<input id="preco" name="preco" type="text" inputmode="decimal" placeholder="100,00" value="1234,50">',
        '<button type="submit">Salvar alterações</button>',
      ].join('\n'),
    );
    expect(body).toContain('<dt>Preço</dt><dd>R$ 1.234,50</dd>');
  });
});
