// Atomicidade do check-in sob concorrência real (spec 5.4): cada check-in numa transação numa
// conexão própria contra o PostgreSQL dos gates, repetido em ingressos novos.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/pool.js';
import { checkInTicket, type CheckInResult } from '../../src/features/checkin/public.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { seedAccounts } from '../helpers/seed.js';
import { warmPool } from '../f05/support.js';

let pool: Db;

// 20 conexões próprias + as 10 do pool de teste ficam abaixo do max_connections (100) do banco.
beforeAll(async () => {
  pool = await warmPool(20);
});

afterAll(async () => {
  await pool.end();
});

function tally(results: readonly CheckInResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) counts[result] = (counts[result] ?? 0) + 1;
  return counts;
}

async function checkedInRow(id: string) {
  const { rows } = await testDb().query<{ status: string; checked_in: boolean; checked_in_at: Date | null }>(
    'SELECT status, checked_in, checked_in_at FROM tickets WHERE id = $1',
    [id],
  );
  return rows[0];
}

describe('F08 concorrência do check-in', () => {
  it('F08-CA02 checkInTicket simultâneo em conexões separadas libera uma vez só', async () => {
    const accounts = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: accounts.organizadorA.id });
    for (let round = 0; round < 5; round += 1) {
      const ticket = await insertTestTicket(testDb(), { eventId: event.id, status: 'confirmed' });
      const outcomes = await Promise.all(Array.from({ length: 10 }, () => checkInTicket(pool, event.id, ticket.code)));
      expect(tally(outcomes.map((outcome) => outcome.result))).toEqual({ liberada: 1, ja_utilizado: 9 });
      const released = outcomes.find((outcome) => outcome.result === 'liberada');
      expect(released?.ticket?.checkedIn).toBe(true);
      const row = await checkedInRow(ticket.id);
      expect(row).toMatchObject({ status: 'confirmed', checked_in: true });
      expect(row?.checked_in_at?.getTime()).toBe(released?.ticket?.checkedInAt?.getTime());
    }
  });
});
