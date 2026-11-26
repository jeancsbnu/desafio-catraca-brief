import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { Db, DbClient } from '../../src/db/pool.js';
import type { EventRecord } from '../../src/features/eventos/public.js';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { sessionCookieFor } from '../helpers/session.js';
import { createViaHttp, DEPOIS, get, occurrences, postEmpty, postForm, PROX, snapshot } from './support.js';

const CANCELLED = 'Este evento foi cancelado e não pode mais ser alterado';
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function setup(register?: (app: FastifyInstance) => void) {
  const test = await createTestApp();
  register?.(test.app);
  const accounts = await seedAccounts();
  const cookieA = await sessionCookieFor(test.app, accounts.organizadorA.id);
  return { ...test, ...accounts, cookieA };
}

async function publishedEvent(app: FastifyInstance, cookie: string, nome = 'Para cancelar'): Promise<string> {
  const id = await createViaHttp(app, cookie, { nome });
  const response = await postEmpty(app, `/organizador/eventos/${id}/publicar`, cookie);
  expect(response.statusCode).toBe(302);
  return id;
}

function confirm(app: FastifyInstance, id: string, cookie: string) {
  return postForm(app, `/organizador/eventos/${id}/cancelar`, { confirmar: 'sim' }, cookie);
}

async function statusOf(app: FastifyInstance, id: string): Promise<string | undefined> {
  const { rows } = await app.db.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [id]);
  return rows[0]?.status;
}

describe('F04 cancelamento', () => {
  it('F04-CA06 cancelar pede confirmação: GET e POST sem confirmar não mudam o status', async () => {
    const { app, db, cookieA } = await setup();
    const id = await publishedEvent(app, cookieA, 'Show <cancelável>');
    const before = await snapshot(db, id);
    const expected = [
      '<h1>Cancelar evento</h1>',
      '<p>Evento: <strong>Show &lt;cancelável&gt;</strong></p>',
      '<p>Cancelar é irreversível. Confirmar?</p>',
      `<form method="post" action="/organizador/eventos/${id}/cancelar"><input type="hidden" name="confirmar" value="sim"><button type="submit">Confirmar cancelamento</button></form>`,
      `<p><a href="/organizador/eventos/${id}">Voltar</a></p>`,
    ].join('\n');
    const responses = [
      await get(app, `/organizador/eventos/${id}/cancelar`, cookieA),
      await postEmpty(app, `/organizador/eventos/${id}/cancelar`, cookieA),
      await postForm(app, `/organizador/eventos/${id}/cancelar`, { confirmar: 'nao' }, cookieA),
      await postForm(app, `/organizador/eventos/${id}/cancelar`, new URLSearchParams([['confirmar', 'sim'], ['confirmar', 'sim']]), cookieA),
    ];
    for (const response of responses) {
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('<title>Cancelar evento · Catraca</title>');
      expect(response.body).toContain(expected);
      expect(occurrences(response.body, 'Cancelar é irreversível. Confirmar?')).toBe(1);
    }
    expect(await snapshot(db, id)).toBe(before);
  });

  it('F04-CA06 cancelar com confirmação muda para Cancelado e a página deixa de oferecer editar, publicar e cancelar', async () => {
    const { app, db, cookieA } = await setup();
    const id = await publishedEvent(app, cookieA, 'Cancelado agora');
    const response = await confirm(app, id, cookieA);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`/organizador/eventos/${id}?ok=cancelado`);
    const { rows } = await db.query<{ status: string; published: boolean; cancelled: boolean }>(
      'SELECT status, published_at IS NOT NULL AS published, cancelled_at IS NOT NULL AS cancelled FROM events WHERE id = $1',
      [id],
    );
    expect(rows).toEqual([{ status: 'cancelado', published: true, cancelled: true }]);

    const page = await get(app, `/organizador/eventos/${id}?ok=cancelado`, cookieA);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<p class="msg msg-success" role="status">Evento cancelado com sucesso</p>');
    expect(page.body).toContain('<h1>Cancelado agora</h1>');
    expect(page.body).toContain('<p>Status: <strong data-status="cancelado">Cancelado</strong></p>');
    // Entre os dados e o link de volta, só as seções de outras features (ex.: check-in da F08).
    expect(page.body).toMatch(
      /<\/dl>\n(?:<section class="gestao-secao" data-secao="[a-z][a-z0-9-]*">[\s\S]*?<\/section>\n)*<p><a href="\/organizador">Voltar para meus eventos<\/a><\/p>/,
    );
    for (const text of [
      `/organizador/eventos/${id}/editar`,
      `/organizador/eventos/${id}/publicar`,
      `/organizador/eventos/${id}/cancelar`,
      'Salvar alterações',
      '<button type="submit">Publicar</button>',
      'Cancelar evento',
      'data-secao="edicao"',
    ]) {
      expect(page.body, text).not.toContain(text);
    }
    const list = await get(app, '/organizador', cookieA);
    expect(list.body).toContain(
      `<tr><td><a href="/organizador/eventos/${id}">Cancelado agora</a></td><td>${PROX.br}</td><td>Cancelado</td></tr>`,
    );
  });

  it('F04-CA06 edição, publicação e novo cancelamento em evento cancelado são rejeitados sem alterar dados', async () => {
    const { app, db, cookieA } = await setup();
    const id = await publishedEvent(app, cookieA, 'Já cancelado');
    expect((await confirm(app, id, cookieA)).statusCode).toBe(302);
    const before = await snapshot(db, id);
    const responses = [
      await postForm(
        app,
        `/organizador/eventos/${id}/editar`,
        { nome: 'Novo nome', inicio: DEPOIS.iso, local: 'Outro', lotacao: '5', preco: '200,00' },
        cookieA,
      ),
      await postForm(app, `/organizador/eventos/${id}/editar`, { nome: '' }, cookieA),
      await postEmpty(app, `/organizador/eventos/${id}/publicar`, cookieA),
      await confirm(app, id, cookieA),
      await postEmpty(app, `/organizador/eventos/${id}/cancelar`, cookieA),
      await get(app, `/organizador/eventos/${id}/cancelar`, cookieA),
    ];
    for (const response of responses) {
      expect(response.statusCode).toBe(409);
      expect(response.headers.location).toBeUndefined();
      expect(occurrences(response.body, CANCELLED)).toBe(1);
      expect(response.body).toContain(`<p class="msg msg-error" role="alert">${CANCELLED}</p>`);
      expect(response.body).toContain('<strong data-status="cancelado">Cancelado</strong>');
      expect(response.body).not.toContain('Salvar alterações');
      expect(response.body).not.toContain('Cancelar é irreversível');
      expect(response.body).not.toContain('Informe o nome do evento');
    }
    expect(await snapshot(db, id)).toBe(before);
  });

  it('F04-CA07 rascunho não oferece cancelar e POST de cancelamento é rejeitado', async () => {
    const { app, db, cookieA } = await setup();
    const id = await createViaHttp(app, cookieA);
    const page = await get(app, `/organizador/eventos/${id}`, cookieA);
    expect(page.body).toContain('<strong data-status="rascunho">Rascunho</strong>');
    expect(page.body).toContain('<button type="submit">Publicar</button>');
    expect(page.body).not.toContain('Cancelar evento');
    expect(page.body).not.toContain(`/organizador/eventos/${id}/cancelar`);
    const before = await snapshot(db, id);
    const responses = [
      await confirm(app, id, cookieA),
      await postEmpty(app, `/organizador/eventos/${id}/cancelar`, cookieA),
      await get(app, `/organizador/eventos/${id}/cancelar`, cookieA),
    ];
    for (const response of responses) {
      expect(response.statusCode).toBe(409);
      expect(occurrences(response.body, 'Só evento publicado pode ser cancelado')).toBe(1);
      expect(response.body).not.toContain('Cancelar é irreversível');
      expect(response.body).toContain('<strong data-status="rascunho">Rascunho</strong>');
    }
    expect(await snapshot(db, id)).toBe(before);
    expect(await statusOf(app, id)).toBe('rascunho');
  });

  it('tratadores de evento cancelado rodam em ordem, na mesma transação, com o evento já cancelado', async () => {
    const calls: {
      handler: string;
      status: string;
      cancelledAt: boolean;
      seenElsewhere: string | undefined;
      seenHere: string | undefined;
    }[] = [];
    const handler =
      (name: string, db: Db) =>
      async (event: EventRecord, client: DbClient): Promise<void> => {
        const elsewhere = await db.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [event.id]);
        const here = await client.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [event.id]);
        calls.push({
          handler: name,
          status: event.status,
          cancelledAt: event.cancelledAt instanceof Date,
          seenElsewhere: elsewhere.rows[0]?.status,
          seenHere: here.rows[0]?.status,
        });
      };
    const { app, cookieA } = await setup((instance) => {
      instance.events.onEventCancelled(handler('primeiro', instance.db));
      instance.events.onEventCancelled(handler('segundo', instance.db));
    });
    const id = await publishedEvent(app, cookieA);
    expect(calls).toEqual([]);
    expect((await confirm(app, id, cookieA)).statusCode).toBe(302);
    expect(calls).toEqual([
      { handler: 'primeiro', status: 'cancelado', cancelledAt: true, seenElsewhere: 'publicado', seenHere: 'cancelado' },
      { handler: 'segundo', status: 'cancelado', cancelledAt: true, seenElsewhere: 'publicado', seenHere: 'cancelado' },
    ]);
    expect(await statusOf(app, id)).toBe('cancelado');
  });

  it('falha de um tratador desfaz o cancelamento inteiro', async () => {
    const { app, db, cookieA } = await setup((instance) => {
      instance.events.onEventCancelled(async (event, client) => {
        await client.query("UPDATE events SET location = 'escrita do tratador' WHERE id = $1", [event.id]);
      });
      instance.events.onEventCancelled(async () => {
        throw new Error('falha simulada no tratador');
      });
    });
    const id = await publishedEvent(app, cookieA);
    const before = await snapshot(db, id);
    const response = await confirm(app, id, cookieA);
    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('<h1>Algo deu errado. Tente novamente.</h1>');
    expect(await snapshot(db, id)).toBe(before);
    expect(await statusOf(app, id)).toBe('publicado');
  });

  it('cancelamentos simultâneos do mesmo evento: um 302 e um 409', async () => {
    let handled = 0;
    const { app, cookieA } = await setup((instance) => {
      instance.events.onEventCancelled(async () => {
        handled += 1;
        await sleep(150);
      });
    });
    const id = await publishedEvent(app, cookieA);
    const responses = await Promise.all([confirm(app, id, cookieA), confirm(app, id, cookieA)]);
    const statuses = responses.map((response) => response.statusCode).sort();
    expect(statuses).toEqual([302, 409]);
    const conflict = responses.find((response) => response.statusCode === 409);
    expect(conflict?.body).toContain(CANCELLED);
    expect(handled).toBe(1);
    expect(await statusOf(app, id)).toBe('cancelado');
  });
});
