import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { sessionCookieFor } from '../helpers/session.js';
import { createViaHttp, get, occurrences, postEmpty, PROX, snapshot } from './support.js';

async function setup() {
  const test = await createTestApp();
  const accounts = await seedAccounts();
  const cookieA = await sessionCookieFor(test.app, accounts.organizadorA.id);
  return { ...test, ...accounts, cookieA };
}

describe('F04 publicação', () => {
  it('F04-CA04 Publicar muda o rascunho para Publicado', async () => {
    const { app, db, cookieA } = await setup();
    const id = await createViaHttp(app, cookieA, { nome: 'Para publicar' });
    const response = await postEmpty(app, `/organizador/eventos/${id}/publicar`, cookieA);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`/organizador/eventos/${id}?ok=publicado`);

    const { rows } = await db.query<{ status: string; published: boolean; cancelled: boolean }>(
      'SELECT status, published_at IS NOT NULL AS published, cancelled_at IS NOT NULL AS cancelled FROM events WHERE id = $1',
      [id],
    );
    expect(rows).toEqual([{ status: 'publicado', published: true, cancelled: false }]);

    const page = await get(app, `/organizador/eventos/${id}?ok=publicado`, cookieA);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<p class="msg msg-success" role="status">Evento publicado</p>');
    expect(page.body).toContain('<p>Status: <strong data-status="publicado">Publicado</strong></p>');
    expect(page.body).toContain(`<form method="post" action="/organizador/eventos/${id}/editar">`);
    expect(page.body).toContain(
      `<form method="get" action="/organizador/eventos/${id}/cancelar"><button type="submit">Cancelar evento</button></form>`,
    );
    expect(page.body).not.toContain('<button type="submit">Publicar</button>');
    expect(page.body).not.toContain(`/organizador/eventos/${id}/publicar`);

    const list = await get(app, '/organizador', cookieA);
    expect(list.body).toContain(
      `<tr><td><a href="/organizador/eventos/${id}">Para publicar</a></td><td>${PROX.br}</td><td>Publicado</td></tr>`,
    );
  });

  it('publicar de novo responde 409 Este evento já está publicado e nada muda', async () => {
    const { app, db, cookieA } = await setup();
    const id = await createViaHttp(app, cookieA);
    expect((await postEmpty(app, `/organizador/eventos/${id}/publicar`, cookieA)).statusCode).toBe(302);
    const before = await snapshot(db, id);
    const again = await postEmpty(app, `/organizador/eventos/${id}/publicar`, cookieA);
    expect(again.statusCode).toBe(409);
    expect(again.headers.location).toBeUndefined();
    expect(occurrences(again.body, 'Este evento já está publicado')).toBe(1);
    expect(again.body).toContain('<p class="msg msg-error" role="alert">Este evento já está publicado</p>');
    expect(again.body).toContain('<strong data-status="publicado">Publicado</strong>');
    expect(await snapshot(db, id)).toBe(before);
  });
});
