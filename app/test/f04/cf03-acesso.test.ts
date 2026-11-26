import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { countEvents, createViaHttp, eventFields, get, postEmpty, postForm, snapshot } from './support.js';

/** As 8 rotas de 5.1, com um evento real (publicado) de A. */
function allRoutes(app: FastifyInstance, id: string, cookie?: string): Promise<LightMyRequestResponse>[] {
  const fields = { ...eventFields({ nome: 'Criado por intruso', lotacao: '9', preco: '1,00' }) };
  return [
    get(app, '/organizador', cookie),
    get(app, '/organizador/eventos/novo', cookie),
    postForm(app, '/organizador/eventos', fields, cookie),
    get(app, `/organizador/eventos/${id}`, cookie),
    postForm(app, `/organizador/eventos/${id}/editar`, fields, cookie),
    postEmpty(app, `/organizador/eventos/${id}/publicar`, cookie),
    get(app, `/organizador/eventos/${id}/cancelar`, cookie),
    postForm(app, `/organizador/eventos/${id}/cancelar`, { confirmar: 'sim' }, cookie),
  ];
}

async function setup() {
  const test = await createTestApp();
  await seedAccounts();
  const cookieA = await loginAs(test.app, 'organizador.a@catraca.test');
  const id = await createViaHttp(test.app, cookieA, { nome: 'Oculto F04', local: 'Lugar oculto F04' });
  expect((await postEmpty(test.app, `/organizador/eventos/${id}/publicar`, cookieA)).statusCode).toBe(302);
  return { ...test, cookieA, id };
}

describe('CF03 F02 → F04: gestão de eventos só para organizador', () => {
  it('CF03 visitante é redirecionado para /entrar em todas as rotas de eventos', async () => {
    const { app, db, id } = await setup();
    const before = await snapshot(db, id);
    const responses = await Promise.all(allRoutes(app, id));
    expect(responses).toHaveLength(8);
    for (const response of responses) {
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/entrar');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(await countEvents(db)).toBe(1);
    expect(await snapshot(db, id)).toBe(before);
  });

  it('CF03 participante recebe 403 Acesso negado em todas as rotas de eventos, sem dados de evento', async () => {
    const { app, db, id } = await setup();
    const cookieP = await loginAs(app, 'participante@catraca.test');
    const before = await snapshot(db, id);
    const responses = await Promise.all(allRoutes(app, id, cookieP));
    for (const response of responses) {
      expect(response.statusCode).toBe(403);
      expect(response.headers.location).toBeUndefined();
      expect(response.body).toContain('<h1>Acesso negado</h1>');
      expect(response.body).not.toContain('Oculto F04');
      expect(response.body).not.toContain('Lugar oculto F04');
      expect(response.body).not.toContain(id);
    }
    expect(await countEvents(db)).toBe(1);
    expect(await snapshot(db, id)).toBe(before);
  });

  it('CF03 organizador B não vê nem opera eventos de A pela lista nem pela URL direta', async () => {
    const { app, db, id } = await setup();
    const cookieB = await loginAs(app, 'organizador.b@catraca.test');
    const before = await snapshot(db, id);
    const list = await get(app, '/organizador', cookieB);
    expect(list.statusCode).toBe(200);
    expect(list.body).toContain('Você ainda não tem eventos.');
    expect(list.body).not.toContain(id);
    expect(list.body).not.toContain('Oculto F04');
    const [, , created, ...onEvent] = await Promise.all(allRoutes(app, id, cookieB));
    expect(created?.statusCode).toBe(302); // B cria o próprio evento normalmente
    for (const response of onEvent) {
      expect(response.statusCode).toBe(404);
      expect(response.body).toContain('<h1>Evento não encontrado</h1>');
      expect(response.body).not.toContain('Oculto F04');
      expect(response.body).not.toContain('Lugar oculto F04');
    }
    expect(await snapshot(db, id)).toBe(before);
    const { rows } = await db.query<{ email: string }>(
      "SELECT u.email FROM events e JOIN users u ON u.id = e.organizer_id WHERE e.name = 'Criado por intruso'",
    );
    expect(rows).toEqual([{ email: 'organizador.b@catraca.test' }]);
  });
});
