// Janelas do gateway de ponta a ponta (compra → mudança de status do ingresso), no relógio do banco,
// com o worker real da F03.
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { getSeatAvailability, type TicketRecord } from '../../src/features/ingressos/public.js';
import { createTestApp } from '../helpers/app.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { sleep } from './support.js';

/** Sem nenhuma variável de gateway (nem as do ambiente do processo de testes). */
const SEM_VARIAVEIS_DE_GATEWAY = { GATEWAY_MODE: undefined, GATEWAY_DELAY_SCALE: undefined };

async function buy(app: FastifyInstance, eventId: string, cardNumber: string): Promise<TicketRecord> {
  const result = await app.tickets.purchase({
    eventId,
    buyer: { type: 'email', email: 'ana@example.com' },
    cardNumber,
    channel: 'api',
  });
  if (!result.ok) throw new Error(`compra recusada: ${result.reason}`);
  return result.ticket;
}

interface Timing {
  id: string;
  status: string;
  seconds: number;
}

async function timings(app: FastifyInstance, ids: readonly string[]): Promise<Timing[]> {
  const { rows } = await app.db.query<Timing>(
    `SELECT id, status, EXTRACT(EPOCH FROM status_changed_at - created_at)::float8 AS seconds
       FROM tickets WHERE id = ANY($1::text[]) ORDER BY array_position($1::text[], id)`,
    [ids],
  );
  return rows;
}

/** Espera os ingressos saírem de pending (consulta a cada 50 ms) até o limite. */
async function waitSettled(app: FastifyInstance, ids: readonly string[], timeoutMs: number): Promise<Timing[]> {
  const limit = Date.now() + timeoutMs;
  for (;;) {
    const rows = await timings(app, ids);
    if (rows.every((row) => row.status !== 'pending') || Date.now() >= limit) return rows;
    await sleep(50);
  }
}

/** Status dos ingressos quando todos completam `seconds` de vida (no relógio do banco). */
async function statusAtAge(app: FastifyInstance, ids: readonly string[], seconds: number): Promise<{ statuses: string[]; age: number }> {
  // O relógio do banco manda: repete até a idade ser atingida (o timer do Node pode adiantar ~1 ms).
  for (;;) {
    const { rows: wait } = await app.db.query<{ remaining: number }>(
      `SELECT greatest(0, $2::float8 - EXTRACT(EPOCH FROM clock_timestamp() - max(created_at)))::float8 AS remaining
         FROM tickets WHERE id = ANY($1::text[])`,
      [ids, seconds],
    );
    const remaining = wait[0]?.remaining ?? 0;
    if (remaining <= 0) break;
    await sleep(remaining * 1000 + 2);
  }
  const { rows } = await app.db.query<{ status: string; age: number }>(
    `SELECT status, EXTRACT(EPOCH FROM clock_timestamp() - created_at)::float8 AS age
       FROM tickets WHERE id = ANY($1::text[]) ORDER BY array_position($1::text[], id)`,
    [ids],
  );
  return { statuses: rows.map((row) => row.status), age: Math.min(...rows.map((row) => row.age)) };
}

describe('F05 tempos do ciclo do ingresso', () => {
  it('F05-CA01 CF04 com a configuração padrão, 0001 confirma e 0002 recusa entre 2 e 5 s depois da compra', async () => {
    const { app, db, config } = await createTestApp({ backgroundJobs: true, config: SEM_VARIAVEIS_DE_GATEWAY });
    expect(config.gateway).toEqual({ mode: 'simulado', delayScale: 1 });
    await app.ready();
    const accounts = await seedAccounts();
    const approvedEvent = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 5 });
    const declinedEvent = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 1 });
    const approved = await buy(app, approvedEvent.id, '4000000000000001');
    const declined = await buy(app, declinedEvent.id, '4000000000000002');
    const ids = [approved.id, declined.id];

    const early = await statusAtAge(app, ids, 1.9);
    expect(early.statuses).toEqual(['pending', 'pending']);
    expect(early.age).toBeGreaterThanOrEqual(1.9);
    expect((await getSeatAvailability(db, declinedEvent.id))?.available).toBe(0);

    const settled = await waitSettled(app, ids, 6000);
    expect(settled.map((row) => row.status)).toEqual(['confirmed', 'declined']);
    for (const row of settled) {
      expect(row.seconds, row.id).toBeGreaterThanOrEqual(2.0);
      expect(row.seconds, row.id).toBeLessThanOrEqual(5.0);
    }
    expect((await getSeatAvailability(db, declinedEvent.id))?.available).toBe(1);
  });

  it('F05-CA02 CF04 com escala 0,1, 0003 e 0004 ficam pending aos 2,9 s e são resolvidos entre 3,0 e 4,0 s', async () => {
    const { app, db } = await createTestApp({ config: { GATEWAY_DELAY_SCALE: '0.1' } });
    expect(app.gateway.escala).toBe(0.1);
    app.gateway.iniciarWorker({ intervaloMs: 20 });
    const accounts = await seedAccounts();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 2 });
    const slowApproved = await buy(app, event.id, '4000000000000003');
    const slowDeclined = await buy(app, event.id, '4000000000000004');
    const ids = [slowApproved.id, slowDeclined.id];
    expect((await getSeatAvailability(db, event.id))?.available).toBe(0);

    const early = await statusAtAge(app, ids, 2.9);
    expect(early.statuses).toEqual(['pending', 'pending']);

    const settled = await waitSettled(app, ids, 3000);
    expect(settled.map((row) => row.status)).toEqual(['confirmed', 'declined']);
    for (const row of settled) {
      expect(row.seconds, row.id).toBeGreaterThanOrEqual(3.0);
      expect(row.seconds, row.id).toBeLessThanOrEqual(4.0);
    }
    expect((await getSeatAvailability(db, event.id))?.available).toBe(1);
    await app.gateway.pararWorker();
  });
});
