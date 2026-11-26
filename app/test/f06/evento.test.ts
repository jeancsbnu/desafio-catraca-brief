// Página pública do evento GET /eventos/:id (spec 5.3): dados, vagas, bloco de compra conforme quem
// olha e as vagas, e o 404 idêntico para rascunho, cancelado, inexistente e id inválido.
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { PROX } from '../f04/support.js';
import {
  ORGANIZER_BLOCK,
  SOLD_OUT_BLOCK,
  formBlock,
  get,
  loginBlock,
  productDate,
  purchaseBlock,
  signupParticipant,
} from './support.js';

describe('F06 página do evento', () => {
  it('página do evento mostra nome, data e hora, local, preço e vagas', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), {
      organizerId: organizadorA.id,
      name: 'Show <Especial>',
      startsAt: productDate(PROX),
      location: 'Bar & Cia',
      capacity: 3,
      priceCents: 123456,
    });
    await insertTestTicket(testDb(), { eventId: event.id, status: 'confirmed' });

    const response = await get(app, `/eventos/${event.id}`);
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<title>Show &lt;Especial&gt; · Catraca</title>');
    expect(response.body).toContain(
      [
        '<h1>Show &lt;Especial&gt;</h1>',
        '<dl>',
        `<dt>Data e hora</dt><dd>${PROX.br}</dd>`,
        '<dt>Local</dt><dd>Bar &amp; Cia</dd>',
        '<dt>Preço</dt><dd>R$ 1.234,56</dd>',
        '<dt>Vagas disponíveis</dt><dd>2</dd>',
        '</dl>',
        loginBlock(event.id),
        '<p><a href="/">Voltar para a vitrine</a></p>',
      ].join('\n'),
    );
  });

  it('F06-CA05 visitante vê Entrar para comprar com volta para o evento', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });
    const { body } = await get(app, `/eventos/${event.id}`);
    expect(purchaseBlock(body)).toEqual({ kind: 'entrar', html: loginBlock(event.id) });
    expect(body).toContain(`href="/entrar?voltar=%2Feventos%2F${event.id}"`);
    expect(body).not.toContain('action="/eventos/');
    expect(body.split('Entrar para comprar')).toHaveLength(2);
  });

  it('F06-CA05 organizador logado vê Compras são feitas com uma conta de participante no lugar do formulário', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });
    const soldOut = await insertTestEvent(testDb(), { organizerId: organizadorA.id, capacity: 1 });
    await insertTestTicket(testDb(), { eventId: soldOut.id, status: 'pending' });

    for (const email of ['organizador.a@catraca.test', 'organizador.b@catraca.test']) {
      const cookie = await loginAs(app, email);
      for (const id of [event.id, soldOut.id]) {
        const response = await get(app, `/eventos/${id}`, cookie);
        expect(response.statusCode).toBe(200);
        expect(purchaseBlock(response.body)).toEqual({ kind: 'organizador', html: ORGANIZER_BLOCK });
        expect(response.body).not.toContain('Entrar para comprar');
        expect(response.body).not.toContain('action="/eventos/');
        expect(response.body).not.toContain('<p><strong>Ingressos esgotados</strong></p>');
      }
    }
  });

  it('participante com vaga vê o formulário com o campo Número do cartão', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });
    const { cookie } = await signupParticipant(app);
    const { body } = await get(app, `/eventos/${event.id}`, cookie);
    expect(purchaseBlock(body)).toEqual({ kind: 'formulario', html: formBlock(event.id) });
    expect(body).not.toMatch(/<input id="cartao"[^>]* value=/);
    expect(body).not.toMatch(/ (required|pattern|maxlength)[ =>]/);
    expect(body).not.toContain('Entrar para comprar');
  });

  it('F06-CA03 com 0 vagas a página mostra Ingressos esgotados no lugar do formulário', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id, capacity: 2 });
    await insertTestTicket(testDb(), { eventId: event.id, status: 'pending' });
    await insertTestTicket(testDb(), { eventId: event.id, status: 'confirmed' });
    await insertTestTicket(testDb(), { eventId: event.id, status: 'declined' });
    const { cookie } = await signupParticipant(app);

    for (const session of [cookie, null]) {
      const { statusCode, body } = await get(app, `/eventos/${event.id}`, session);
      expect(statusCode).toBe(200);
      expect(body).toContain('<dt>Vagas disponíveis</dt><dd>0</dd>');
      expect(purchaseBlock(body)).toEqual({ kind: 'esgotado', html: SOLD_OUT_BLOCK });
      expect(body).not.toContain(`action="/eventos/${event.id}/comprar"`);
      expect(body).not.toContain('Número do cartão');
      expect(body).not.toContain('Entrar para comprar');
    }
  });

  it('CF08 rascunho, cancelado, inexistente e id inválido respondem 404 Evento não encontrado com o mesmo corpo', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const draft = await insertTestEvent(testDb(), { organizerId: organizadorA.id, name: 'Rascunho Secreto', status: 'rascunho' });
    const cancelled = await insertTestEvent(testDb(), { organizerId: organizadorA.id, name: 'Cancelado Secreto', status: 'cancelado' });
    const { cookie } = await signupParticipant(app);

    for (const session of [null, cookie]) {
      const bodies: string[] = [];
      for (const id of [draft.id, cancelled.id, 'evt_0000000000000000', 'nao-e-um-evento']) {
        const response = await get(app, `/eventos/${id}`, session);
        expect(response.statusCode).toBe(404);
        expect(response.body).toContain('<title>Evento não encontrado · Catraca</title>');
        expect(response.body).toContain('<h1>Evento não encontrado</h1>\n<p><a href="/">Voltar para a vitrine</a></p>');
        expect(response.body).not.toContain(id);
        expect(response.body).not.toContain('data-compra');
        bodies.push(response.body);
      }
      expect(new Set(bodies).size).toBe(1);
      expect(bodies[0]).not.toContain('Secreto');
    }
  });
});
