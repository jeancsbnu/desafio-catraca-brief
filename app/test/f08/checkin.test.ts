// As situações de R10 pelo HTTP, com ingressos em cada estado e dos dois canais; o código em branco
// (spec 5.2–5.6, 5.8).
import { describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/pool.js';
import { checkInTicket } from '../../src/features/checkin/public.js';
import { postCheckIn } from '../helpers/checkin.js';
import { insertTestEvent } from '../helpers/events.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { loginAs } from '../helpers/session.js';
import { postEmpty, postForm } from '../f04/support.js';
import { checkinLogs, setup, ticketMark, ticketSnapshot } from './support.js';

/** Linha do ingresso sem as colunas da marcação (o resto não pode mudar no check-in). */
async function withoutMark(db: Db, id: string): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM tickets WHERE id = $1', [id]);
  const { checked_in: _a, checked_in_at: _b, ...rest } = rows[0] ?? {};
  return rest;
}

describe('F08 check-in pela página de gestão', () => {
  it('F08-CA02 confirmado sem check-in resulta em Entrada liberada e marca checkedIn com data e hora', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    const before = await withoutMark(db, ticket.id);
    const startedAt = Date.now();
    const response = await postCheckIn(app, cookieA, event.id, ticket.code);
    expect(response).toMatchObject({ statusCode: 200, result: 'liberada', message: 'Entrada liberada' });
    const mark = await ticketMark(db, ticket.id);
    expect(mark?.status).toBe('confirmed');
    expect(mark?.checked_in).toBe(true);
    expect(mark?.checked_in_at).toBeInstanceOf(Date);
    expect(Math.abs((mark?.checked_in_at?.getTime() ?? 0) - startedAt)).toBeLessThan(10_000);
    expect(await withoutMark(db, ticket.id)).toEqual(before);
    // O check-in não muda o evento.
    const { rows } = await db.query<{ status: string }>('SELECT status FROM events WHERE id = $1', [event.id]);
    expect(rows[0]?.status).toBe('publicado');
  });

  it('F08-CA03 o mesmo código de novo resulta em Ingresso já utilizado e nada muda', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    expect((await postCheckIn(app, cookieA, event.id, ticket.code)).result).toBe('liberada');
    const after = await ticketSnapshot(db, ticket.id);
    for (let i = 0; i < 2; i += 1) {
      const again = await postCheckIn(app, cookieA, event.id, ticket.code);
      expect(again).toMatchObject({ statusCode: 200, result: 'ja_utilizado', message: 'Ingresso já utilizado' });
    }
    expect(await ticketSnapshot(db, ticket.id)).toBe(after);
  });

  it('F08-CA04 pending e declined do evento resultam em Ingresso não confirmado sem marcar', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    for (const status of ['pending', 'declined', 'cancelled', 'refunded'] as const) {
      const ticket = await insertTestTicket(db, { eventId: event.id, status });
      const before = await ticketSnapshot(db, ticket.id);
      const response = await postCheckIn(app, cookieA, event.id, ticket.code);
      expect(response, status).toMatchObject({ statusCode: 200, result: 'nao_confirmado', message: 'Ingresso não confirmado' });
      expect(await ticketSnapshot(db, ticket.id)).toBe(before);
    }
  });

  it('F08-CA05 ZZZZZZZZ, código malformado e código de outro evento resultam em Ingresso inválido para este evento', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const own = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    const otherA = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const otherB = await insertTestEvent(db, { organizerId: accounts.organizadorB.id });
    const ticketA = await insertTestTicket(db, { eventId: otherA.id, status: 'confirmed' });
    const ticketB = await insertTestTicket(db, { eventId: otherB.id, status: 'confirmed' });
    const snapshots = await Promise.all([own, ticketA, ticketB].map((ticket) => ticketSnapshot(db, ticket.id)));
    const codes = [
      'ZZZZZZZZ',
      'ABC123',
      `${own.code}X`,
      `${own.code.slice(0, 4)}-${own.code.slice(4)}`,
      ticketA.code,
      `  ${ticketA.code.toLowerCase()}  `,
      ticketB.code,
    ];
    for (const code of codes) {
      const response = await postCheckIn(app, cookieA, event.id, code);
      expect(response, code).toMatchObject({
        statusCode: 200,
        result: 'invalido',
        message: 'Ingresso inválido para este evento',
      });
      // Nada do ingresso de outro evento aparece na página.
      expect(response.body).not.toContain(ticketB.id);
    }
    expect(await Promise.all([own, ticketA, ticketB].map((ticket) => ticketSnapshot(db, ticket.id)))).toEqual(snapshots);
    // Os códigos eram válidos nos próprios eventos.
    expect((await postCheckIn(app, cookieA, otherA.id, ticketA.code)).result).toBe('liberada');
    const cookieB = await loginAs(app, 'organizador.b@catraca.test');
    expect((await postCheckIn(app, cookieB, otherB.id, ticketB.code)).result).toBe('liberada');
  });

  it('F08-CA06 em evento cancelado, refunded, cancelled e refunded com check-in resultam em Evento cancelado; outro evento é inválido', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, status: 'cancelado' });
    const tickets = [
      await insertTestTicket(db, { eventId: event.id, status: 'refunded' }),
      await insertTestTicket(db, { eventId: event.id, status: 'cancelled' }),
      await insertTestTicket(db, { eventId: event.id, status: 'refunded', checkedIn: true }),
      await insertTestTicket(db, { eventId: event.id, status: 'declined' }),
    ];
    const other = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const otherTicket = await insertTestTicket(db, { eventId: other.id, status: 'confirmed' });
    const all = [...tickets, otherTicket];
    const snapshots = await Promise.all(all.map((ticket) => ticketSnapshot(db, ticket.id)));
    for (const ticket of tickets) {
      const response = await postCheckIn(app, cookieA, event.id, ticket.code);
      expect(response, ticket.status).toMatchObject({ statusCode: 200, result: 'evento_cancelado', message: 'Evento cancelado' });
      expect(response.body).toContain('<strong data-status="cancelado">Cancelado</strong>');
      expect(response.body).toContain('data-secao="checkin"');
    }
    const invalid = await postCheckIn(app, cookieA, event.id, otherTicket.code);
    expect(invalid).toMatchObject({ statusCode: 200, result: 'invalido', message: 'Ingresso inválido para este evento' });
    expect((await postCheckIn(app, cookieA, event.id, 'ZZZZZZZZ')).result).toBe('invalido');
    expect(await Promise.all(all.map((ticket) => ticketSnapshot(db, ticket.id)))).toEqual(snapshots);
  });

  it('F08-CA07 código com espaços nas pontas e em minúsculas encontra o ingresso K7Q2M9XA', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await insertTestTicket(db, { eventId: event.id, status: 'confirmed', code: 'K7Q2M9XA' });
    const response = await postCheckIn(app, cookieA, event.id, ' k7q2m9xa ');
    expect(response).toMatchObject({ statusCode: 200, result: 'liberada', message: 'Entrada liberada' });
    expect(response.body).toContain('Código conferido: <strong>K7Q2M9XA</strong>');
    expect((await ticketMark(db, ticket.id))?.checked_in).toBe(true);
    // A forma maiúscula (e a de caixa misturada) é o mesmo ingresso.
    expect((await postCheckIn(app, cookieA, event.id, 'K7Q2M9XA')).result).toBe('ja_utilizado');
    expect((await postCheckIn(app, cookieA, event.id, '\tk7Q2m9Xa  ')).result).toBe('ja_utilizado');
  });

  it('ingressos da vitrine e da API passam pelo mesmo check-in', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const vitrine = await insertTestTicket(db, {
      eventId: event.id,
      status: 'confirmed',
      channel: 'vitrine',
      buyerUserId: accounts.participante.id,
    });
    const api = await insertTestTicket(db, { eventId: event.id, status: 'confirmed', channel: 'api', buyerEmail: 'ana@example.com' });
    for (const ticket of [vitrine, api]) {
      expect((await postCheckIn(app, cookieA, event.id, ticket.code)).result, ticket.channel).toBe('liberada');
      expect((await postCheckIn(app, cookieA, event.id, ticket.code)).result, ticket.channel).toBe('ja_utilizado');
    }
  });

  it('código em branco responde 422 com Informe o código do ingresso sem consultar o banco', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    const responses = [
      await postCheckIn(app, cookieA, event.id, ''),
      await postCheckIn(app, cookieA, event.id, '   '),
      await postCheckIn(app, cookieA, event.id, ' \t\n '),
      await postForm(app, `/organizador/eventos/${event.id}/checkin`, { outro: ticket.code }, cookieA),
      await postForm(app, `/organizador/eventos/${event.id}/checkin`, new URLSearchParams([['codigo', ticket.code], ['codigo', ticket.code]]), cookieA),
      await postEmpty(app, `/organizador/eventos/${event.id}/checkin`, cookieA),
    ];
    for (const response of responses) {
      expect(response.statusCode).toBe(422);
      expect(response.body).toContain(
        '<p class="msg msg-error" role="alert" data-checkin-resultado="codigo_vazio">Informe o código do ingresso</p>',
      );
      expect(response.body).not.toContain('checkin-codigo');
      expect(response.body).toContain(`<h1>${event.name}</h1>`);
    }
    expect((await ticketMark(db, ticket.id))?.checked_in).toBe(false);

    // O serviço nem abre conexão: um Db que lança em connect/query não é chamado.
    let touched = 0;
    const fakeDb = {
      connect: () => {
        touched += 1;
        throw new Error('não deveria conectar');
      },
      query: () => {
        touched += 1;
        throw new Error('não deveria consultar');
      },
    } as unknown as Db;
    for (const typed of ['', '   ', '\t\n']) {
      const outcome = await checkInTicket(fakeDb, event.id, typed);
      expect(outcome).toEqual({ result: 'codigo_vazio', message: 'Informe o código do ingresso', code: null, ticket: null, event: null });
    }
    expect(touched).toBe(0);
  });

  it('em rascunho qualquer código é inválido', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const draft = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, status: 'rascunho' });
    const other = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await insertTestTicket(db, { eventId: other.id, status: 'confirmed' });
    for (const code of ['ZZZZZZZZ', ticket.code, 'abc']) {
      const response = await postCheckIn(app, cookieA, draft.id, code);
      expect(response, code).toMatchObject({ statusCode: 200, result: 'invalido' });
      expect(response.body).toContain('<strong data-status="rascunho">Rascunho</strong>');
    }
    expect((await ticketMark(db, ticket.id))?.checked_in).toBe(false);
  });

  it('os logs registram o resultado do check-in sem o código digitado', async () => {
    const { app, db, accounts, cookieA, logs: calls } = await setup({ captureLogs: true });
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    await postCheckIn(app, cookieA, event.id, ticket.code);
    await postCheckIn(app, cookieA, event.id, ticket.code);
    await postCheckIn(app, cookieA, event.id, 'ZZZZZZZZ');
    await postCheckIn(app, cookieA, event.id, '');
    expect(checkinLogs(calls)).toEqual([
      { msg: 'checkin: entrada liberada', data: { eventId: event.id, ticketId: ticket.id } },
      { msg: 'checkin: entrada recusada', data: { eventId: event.id, resultado: 'ja_utilizado', ticketId: ticket.id } },
      { msg: 'checkin: entrada recusada', data: { eventId: event.id, resultado: 'invalido', ticketId: null } },
      { msg: 'checkin: entrada recusada', data: { eventId: event.id, resultado: 'codigo_vazio', ticketId: null } },
    ]);
    expect(JSON.stringify(checkinLogs(calls))).not.toContain(ticket.code);
  });
});
