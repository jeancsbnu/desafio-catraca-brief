// Atomicidade do check-in sob concorrência real (spec 5.4): cada check-in numa transação numa
// conexão própria contra o PostgreSQL dos gates, repetido em ingressos novos; corrida com o
// cancelamento da F04 e independência entre eventos.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/pool.js';
import { checkInTicket, type CheckInResult } from '../../src/features/checkin/public.js';
import { lockEventForUpdate } from '../../src/features/eventos/public.js';
import { postCheckIn } from '../helpers/checkin.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { seedAccounts } from '../helpers/seed.js';
import { postForm } from '../f04/support.js';
import { sleep, warmPool } from '../f05/support.js';
import { setup, ticketMark } from './support.js';

let pool: Db;

// 20 conexões próprias + as 10 do pool de teste ficam abaixo do max_connections (100) do banco.
beforeAll(async () => {
  pool = await warmPool(20);
});

afterAll(async () => {
  await pool.end();
});

function tally(results: readonly (CheckInResult | null)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) counts[String(result)] = (counts[String(result)] ?? 0) + 1;
  return counts;
}

describe('F08 concorrência do check-in', () => {
  it('F08-CA02 F08-CA03 dez check-ins simultâneos do mesmo código liberam exatamente um, em 5 rodadas', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    for (let round = 0; round < 5; round += 1) {
      const ticket = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
      const responses = await Promise.all(Array.from({ length: 10 }, () => postCheckIn(app, cookieA, event.id, ticket.code)));
      expect(responses.map((response) => response.statusCode)).toEqual(Array.from({ length: 10 }, () => 200));
      expect(tally(responses.map((response) => response.result)), `rodada ${round}`).toEqual({ liberada: 1, ja_utilizado: 9 });
      const mark = await ticketMark(db, ticket.id);
      expect(mark).toMatchObject({ status: 'confirmed', checked_in: true });
    }
    const { rows } = await db.query<{ marked: number; instants: number; total: number }>(
      `SELECT count(*) FILTER (WHERE checked_in) AS marked, count(DISTINCT checked_in_at) AS instants, count(*) AS total
         FROM tickets WHERE event_id = $1`,
      [event.id],
    );
    expect(rows[0]).toEqual({ marked: 5, instants: 5, total: 5 });
  });

  it('F08-CA02 checkInTicket simultâneo em conexões separadas libera uma vez só', async () => {
    const accounts = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: accounts.organizadorA.id });
    for (let round = 0; round < 5; round += 1) {
      const ticket = await insertTestTicket(testDb(), { eventId: event.id, status: 'confirmed' });
      const outcomes = await Promise.all(Array.from({ length: 10 }, () => checkInTicket(pool, event.id, ticket.code)));
      expect(tally(outcomes.map((outcome) => outcome.result))).toEqual({ liberada: 1, ja_utilizado: 9 });
      const released = outcomes.find((outcome) => outcome.result === 'liberada');
      expect(released?.ticket?.checkedIn).toBe(true);
      const mark = await ticketMark(testDb(), ticket.id);
      expect(mark).toMatchObject({ status: 'confirmed', checked_in: true });
      expect(mark?.checked_in_at?.getTime()).toBe(released?.ticket?.checkedInAt?.getTime());
    }
  });

  it('F08-CA06 check-in concorrente com o cancelamento nunca libera entrada depois do cancelamento', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const seen: Record<string, number> = {};
    for (let round = 0; round < 10; round += 1) {
      const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
      const ticket = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
      const cancel = () => postForm(app, `/organizador/eventos/${event.id}/cancelar`, { confirmar: 'sim' }, cookieA);
      const checkIn = () => postCheckIn(app, cookieA, event.id, ticket.code);
      // Alterna quem é disparado primeiro.
      const [cancelResponse, checkInResponse] =
        round % 2 === 0
          ? await Promise.all([cancel(), checkIn()])
          : await Promise.all([checkIn(), cancel()]).then(([c, x]) => [x, c] as const);
      expect(cancelResponse.statusCode).toBe(302);
      expect(checkInResponse.statusCode).toBe(200);
      const result = checkInResponse.result;
      seen[String(result)] = (seen[String(result)] ?? 0) + 1;
      const mark = await ticketMark(db, ticket.id);
      if (result === 'liberada') {
        // Liberado com o evento lido (sob a trava) ainda publicado; o cancelamento veio depois e
        // estornou o ingresso preservando a marcação.
        expect(checkInResponse.body).toContain('<strong data-status="publicado">Publicado</strong>');
        expect(mark).toMatchObject({ status: 'refunded', checked_in: true });
      } else {
        expect(result).toBe('evento_cancelado');
        expect(checkInResponse.body).toContain('<strong data-status="cancelado">Cancelado</strong>');
        expect(mark).toMatchObject({ status: 'refunded', checked_in: false, checked_in_at: null });
      }
    }
    expect(Object.keys(seen).every((key) => key === 'liberada' || key === 'evento_cancelado')).toBe(true);
  });

  it('F08-CA06 o check-in que espera a trava do cancelamento lê o evento cancelado', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await insertTestTicket(db, { eventId: event.id, status: 'confirmed' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      expect((await lockEventForUpdate(client, event.id))?.status).toBe('publicado');
      let settled = false;
      const pending = postCheckIn(app, cookieA, event.id, ticket.code).then((response) => {
        settled = true;
        return response;
      });
      await sleep(300);
      // Enquanto a linha do evento está travada, o check-in espera.
      expect(settled).toBe(false);
      // Simula o cancelamento confirmando com a trava (como o da F04).
      await client.query("UPDATE events SET status = 'cancelado', cancelled_at = now(), updated_at = now() WHERE id = $1", [event.id]);
      await client.query('COMMIT');
      const response = await pending;
      expect(response).toMatchObject({ statusCode: 200, result: 'evento_cancelado', message: 'Evento cancelado' });
      expect(response.body).toContain('<strong data-status="cancelado">Cancelado</strong>');
    } finally {
      client.release();
    }
    expect(await ticketMark(db, ticket.id)).toMatchObject({ checked_in: false, checked_in_at: null });
  });

  it('check-in de um evento não espera a trava de outro evento', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const eventA = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const eventB = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await insertTestTicket(db, { eventId: eventB.id, status: 'confirmed' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await lockEventForUpdate(client, eventA.id);
      const startedAt = performance.now();
      const response = await postCheckIn(app, cookieA, eventB.id, ticket.code);
      const elapsed = performance.now() - startedAt;
      expect(response.result).toBe('liberada');
      expect(elapsed).toBeLessThan(500);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
