// Vitrine GET / (spec 5.2): eventos à venda, por data de início, com data e hora, local, preço e
// vagas disponíveis do serviço da F05.
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { DEPOIS, PROX, monthsAhead } from '../f04/support.js';
import { get, productDate, showcaseRow } from './support.js';

const THEAD =
  '<thead><tr><th>Evento</th><th>Data e hora</th><th>Local</th><th>Preço</th><th>Vagas disponíveis</th><th>Compra</th></tr></thead>';

function row(id: string, name: string, date: string, location: string, price: string, seats: number): string {
  const buy = seats > 0 ? `<a href="/eventos/${id}">Comprar</a>` : 'Ingressos esgotados';
  return `<tr data-evento="${id}"><td><a href="/eventos/${id}">${name}</a></td><td>${date}</td><td>${location}</td><td>${price}</td><td>${seats}</td><td>${buy}</td></tr>`;
}

describe('F06 vitrine', () => {
  it('F06-CA01 deslogado, a vitrine lista o evento publicado com nome, data e hora, local, preço e vagas disponíveis', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), {
      organizerId: organizadorA.id,
      name: 'Show da Vitrine',
      startsAt: productDate(PROX),
      location: 'Bar do Centro',
      capacity: 2,
      priceCents: 10000,
    });

    const response = await get(app, '/');
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<title>Eventos à venda · Catraca</title>');
    expect(response.body).toContain('<h1>Eventos à venda</h1>\n<table>\n' + THEAD + '\n<tbody>\n');
    expect(showcaseRow(response.body, event.id)).toBe(row(event.id, 'Show da Vitrine', PROX.br, 'Bar do Centro', 'R$ 100,00', 2));
    expect(PROX.br).toMatch(/^15\/\d{2}\/\d{4} 21:00$/);
    expect(response.body).not.toContain('Nenhum evento à venda no momento.');
  });

  it('F06-CA01 rascunho e cancelado não aparecem na vitrine', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const draft = await insertTestEvent(testDb(), { organizerId: organizadorA.id, name: 'Rascunho Oculto', status: 'rascunho' });
    const cancelled = await insertTestEvent(testDb(), { organizerId: organizadorA.id, name: 'Cancelado Oculto', status: 'cancelado' });
    const published = await insertTestEvent(testDb(), { organizerId: organizadorA.id, name: 'Publicado Visível' });

    const { body } = await get(app, '/');
    expect(showcaseRow(body, published.id)).not.toBeNull();
    for (const hidden of [draft, cancelled]) {
      expect(body).not.toContain(hidden.id);
      expect(body).not.toContain(hidden.name);
    }
  });

  it('F06-CA01 eventos de todos os organizadores, ordenados pela data de início', async () => {
    const { app } = await createTestApp();
    const { organizadorA, organizadorB } = await seedAccounts();
    const cedo = monthsAhead(1, 10, '19:30');
    const later = await insertTestEvent(testDb(), { organizerId: organizadorA.id, startsAt: productDate(DEPOIS), priceCents: 123456 });
    const early = await insertTestEvent(testDb(), { organizerId: organizadorA.id, startsAt: productDate(cedo) });
    const middle = await insertTestEvent(testDb(), { organizerId: organizadorB.id, startsAt: productDate(PROX), priceCents: 2000 });

    const { body } = await get(app, '/');
    const ids = [...body.matchAll(/<tr data-evento="(evt_[a-z0-9]{16})">/g)].map((match) => match[1]);
    expect(ids).toEqual([early.id, middle.id, later.id]);
    expect(showcaseRow(body, early.id)).toContain(`<td>${cedo.br}</td>`);
    expect(showcaseRow(body, middle.id)).toContain('<td>R$ 20,00</td>');
    expect(showcaseRow(body, later.id)).toContain(`<td>${DEPOIS.br}</td>`);
  });

  it('preço com milhar e centavos usa o formato do produto', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id, priceCents: 123456 });
    const { body } = await get(app, '/');
    expect(showcaseRow(body, event.id)).toContain('<td>R$ 1.234,56</td>');
  });

  it('vitrine sem eventos à venda mantém a mensagem da F01', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    await insertTestEvent(testDb(), { organizerId: organizadorA.id, status: 'rascunho' });
    const response = await get(app, '/');
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<title>Eventos à venda · Catraca</title>');
    expect(response.body).toContain('<h1>Eventos à venda</h1>\n<p>Nenhum evento à venda no momento.</p>');
    expect(response.body).not.toContain('<table>');
  });

  it('nome e local com HTML aparecem escapados', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id, name: '<b>x</b>', location: '<i>"y"</i>' });
    const { body } = await get(app, '/');
    const line = showcaseRow(body, event.id);
    expect(line).toContain('>&lt;b&gt;x&lt;/b&gt;</a>');
    expect(line).toContain('<td>&lt;i&gt;&quot;y&quot;&lt;/i&gt;</td>');
    expect(body).not.toContain('<b>x</b>');
  });

  it('F06-CA07 vagas disponíveis = lotação − pendentes − confirmados; recusados não contam', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id, capacity: 5 });
    for (const status of ['pending', 'confirmed', 'declined', 'declined'] as const) {
      await insertTestTicket(testDb(), { eventId: event.id, status });
    }
    const { body } = await get(app, '/');
    expect(showcaseRow(body, event.id)).toContain(`<td>R$ 100,00</td><td>3</td><td><a href="/eventos/${event.id}">Comprar</a></td></tr>`);
  });

  it('evento sem vagas mostra 0 e Ingressos esgotados na linha', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), {
      organizerId: organizadorA.id,
      capacity: 2,
      name: 'Lotado',
      location: 'Arena',
      startsAt: productDate(PROX),
    });
    await insertTestTicket(testDb(), { eventId: event.id, status: 'pending' });
    await insertTestTicket(testDb(), { eventId: event.id, status: 'confirmed' });
    const { body } = await get(app, '/');
    expect(showcaseRow(body, event.id)).toBe(row(event.id, 'Lotado', PROX.br, 'Arena', 'R$ 100,00', 0));
    expect(showcaseRow(body, event.id)).toMatch(/<td>0<\/td><td>Ingressos esgotados<\/td><\/tr>$/);
    expect(showcaseRow(body, event.id)).not.toContain('Comprar');
  });
});
