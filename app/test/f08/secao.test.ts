// Seção "Check-in" na página de gestão e a resposta do POST (spec 5.1, 5.5, 5.6).
import { describe, expect, it } from 'vitest';
import type { EventStatus } from '../../src/features/eventos/public.js';
import { postCheckIn } from '../helpers/checkin.js';
import { insertTestEvent } from '../helpers/events.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { get } from '../f04/support.js';
import { emptySectionHtml, FOCUSED_INPUT, occurrences, setup } from './support.js';

describe('F08 seção Check-in', () => {
  it('F08-CA01 a página de gestão tem a seção Check-in com o campo Código e o botão Validar em rascunho, publicado e cancelado', async () => {
    const { app, db, accounts, cookieA } = await setup();
    for (const status of ['rascunho', 'publicado', 'cancelado'] as EventStatus[]) {
      const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, status });
      const response = await get(app, `/organizador/eventos/${event.id}`, cookieA);
      expect(response.statusCode, status).toBe(200);
      const body = response.body;
      expect(body).toContain(`<h1>${event.name}</h1>`);
      expect(body, status).toContain(emptySectionHtml(event.id));
      expect(occurrences(body, 'data-secao="checkin"')).toBe(1);
      const dl = body.indexOf('</dl>');
      const section = body.indexOf('data-secao="checkin"');
      const back = body.lastIndexOf('Voltar para meus eventos');
      expect(dl).toBeGreaterThanOrEqual(0);
      expect(dl < section && section < back, status).toBe(true);
      expect(body).not.toContain('data-checkin-resultado');
      expect(body).not.toContain('autofocus');
      expect(body).not.toContain('Código conferido');
    }
  });

  it('F08-CA01 o POST responde a página de gestão com o resultado em destaque e o campo limpo', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    await insertTestTicket(db, { eventId: event.id, status: 'confirmed', code: 'K7Q2M9XA' });
    const response = await postCheckIn(app, cookieA, event.id, ' k7q2m9xa ');
    expect(response.statusCode).toBe(200);
    expect(response.result).toBe('liberada');
    expect(response.message).toBe('Entrada liberada');
    const body = response.body;
    expect(body).toContain(`<h1>${event.name}</h1>`);
    expect(body).toContain('<strong data-status="publicado">Publicado</strong>');
    expect(body).toContain(
      [
        '<section class="gestao-secao" data-secao="checkin"><h2>Check-in</h2>',
        '<p class="msg msg-success" role="status" data-checkin-resultado="liberada">Entrada liberada</p>',
        '<p class="checkin-codigo">Código conferido: <strong>K7Q2M9XA</strong></p>',
        `<form method="post" action="/organizador/eventos/${event.id}/checkin">`,
        '<label for="codigo">Código</label>',
        FOCUSED_INPUT,
        '<button type="submit">Validar</button>',
        '</form></section>',
      ].join('\n'),
    );
    // O texto digitado não volta a nenhum campo.
    expect(body).not.toContain('value=" k7q2m9xa "');
    expect(body).not.toContain('value="K7Q2M9XA"');
    expect(body).not.toContain('value="k7q2m9xa"');
    expect(occurrences(body, 'value=""')).toBeGreaterThanOrEqual(1);
  });

  it('a mensagem do resultado aparece uma única vez na página', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    const first = await postCheckIn(app, cookieA, event.id, ticket.code);
    expect(occurrences(first.body, '>Entrada liberada<')).toBe(1);
    expect(occurrences(first.body, 'data-checkin-resultado')).toBe(1);
    const second = await postCheckIn(app, cookieA, event.id, ticket.code);
    expect(second.body).toContain('<p class="msg msg-error" role="alert" data-checkin-resultado="ja_utilizado">Ingresso já utilizado</p>');
    expect(occurrences(second.body, '>Ingresso já utilizado<')).toBe(1);
    expect(occurrences(second.body, 'data-checkin-resultado')).toBe(1);
    // Recarregar a página de gestão (GET) mostra a seção sem resultado.
    const page = await get(app, `/organizador/eventos/${event.id}`, cookieA);
    expect(page.body).toContain(emptySectionHtml(event.id));
    expect(page.body).not.toContain('data-checkin-resultado');
  });

  it('GET do endereço da ação redireciona para a página de gestão', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const response = await get(app, `/organizador/eventos/${event.id}/checkin`, cookieA);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`/organizador/eventos/${event.id}`);
  });

  it('código com formato inválido não mostra a linha Código conferido', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const response = await postCheckIn(app, cookieA, event.id, 'ABC');
    expect(response.statusCode).toBe(200);
    expect(response.result).toBe('invalido');
    expect(response.body).toContain(
      '<p class="msg msg-error" role="alert" data-checkin-resultado="invalido">Ingresso inválido para este evento</p>',
    );
    expect(response.body).not.toContain('checkin-codigo');
    expect(response.body).not.toContain('value="ABC"');
    // Código com formato, mas inexistente: a linha mostra o código normalizado.
    const unknown = await postCheckIn(app, cookieA, event.id, 'zzzzzzzz');
    expect(unknown.result).toBe('invalido');
    expect(unknown.body).toContain('<p class="checkin-codigo">Código conferido: <strong>ZZZZZZZZ</strong></p>');
  });
});
