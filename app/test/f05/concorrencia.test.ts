// R07 sob concorrência real (spec 5.3): rajadas de compras simultâneas, cada uma numa transação
// numa conexão própria contra o PostgreSQL dos gates, repetidas em eventos novos.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../../src/core/ids.js';
import type { Db } from '../../src/db/pool.js';
import { withTransaction } from '../../src/db/transaction.js';
import { lockEventForUpdate } from '../../src/features/eventos/public.js';
import type { PurchaseInput, PurchaseResult, TicketService } from '../../src/features/ingressos/public.js';
import { insertTicket } from '../../src/features/ingressos/repository.js';
import { createTestApp } from '../helpers/app.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts, type SeededAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { eventFields, postForm } from '../f04/support.js';
import { CARD_OK, occupiedAndTotal, serviceOn, sleep, warmPool } from './support.js';

let pool: Db;
let service: TicketService;

// 60 conexões próprias + as 10 do pool de teste ficam abaixo do max_connections (100) do banco.
beforeAll(async () => {
  pool = await warmPool(60);
  service = serviceOn(pool);
});

afterAll(async () => {
  await pool.end();
});

function api(eventId: string, i: number): PurchaseInput {
  return { eventId, buyer: { type: 'email', email: `rajada-${i}@example.com` }, cardNumber: CARD_OK, channel: 'api' };
}

/** Dispara todas as compras no mesmo instante (sem await entre elas) e espera todas. */
function burst(inputs: readonly PurchaseInput[], on: TicketService = service): Promise<PurchaseResult[]> {
  return Promise.all(inputs.map((input) => on.purchase(input)));
}

function tally(results: readonly PurchaseResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) {
    const key = result.ok ? 'ok' : result.reason;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function newEvent(accounts: SeededAccounts, capacity: number) {
  return insertTestEvent(testDb(), { organizerId: accounts.organizadorA.id, capacity, priceCents: 1000 });
}

/** Amostra pending + confirmed do evento em outra conexão, a cada 2 ms, até parar. */
function sampleOccupied(eventId: string): { stop: () => Promise<{ max: number; samples: number }> } {
  let running = true;
  let max = 0;
  let samples = 0;
  const loop = (async () => {
    const client = await testDb().connect();
    try {
      while (running) {
        const { rows } = await client.query<{ n: number }>(
          "SELECT count(*) AS n FROM tickets WHERE event_id = $1 AND status IN ('pending', 'confirmed')",
          [eventId],
        );
        max = Math.max(max, rows[0]?.n ?? 0);
        samples += 1;
        await sleep(2);
      }
    } finally {
      client.release();
    }
  })();
  return {
    async stop() {
      running = false;
      await loop;
      return { max, samples };
    },
  };
}

describe('F05 concorrência: lotação sob rajada (R07)', () => {
  it('F05-CA05 30 compras simultâneas em lotação 5 criam exatamente 5 ingressos e 25 sold_out, em 5 rodadas com eventos novos', async () => {
    const accounts = await seedAccounts();
    for (let round = 1; round <= 5; round += 1) {
      const event = await newEvent(accounts, 5);
      const results = await burst(Array.from({ length: 30 }, (_, i) => api(event.id, i + 1)));
      expect(tally(results), `rodada ${round}`).toEqual({ ok: 5, sold_out: 25 });
      expect(await occupiedAndTotal(testDb(), event.id), `rodada ${round}`).toEqual({ occupied: 5, total: 5 });
      const { rows } = await testDb().query<{ codes: number }>(
        'SELECT count(DISTINCT code) AS codes FROM tickets WHERE event_id = $1',
        [event.id],
      );
      expect(rows[0]?.codes).toBe(5);
      const created = results.flatMap((result) => (result.ok ? [result.ticket.id] : []));
      const { rows: attempts } = await testDb().query<{ n: number }>(
        "SELECT count(*) AS n FROM payment_attempts WHERE origin = 'compra' AND reference = ANY($1::text[])",
        [created],
      );
      expect(attempts[0]?.n).toBe(5);
    }
  });

  it('F05-CA05 as vagas ocupadas nunca passam da lotação durante a rajada', async () => {
    const accounts = await seedAccounts();
    for (let round = 1; round <= 3; round += 1) {
      const event = await newEvent(accounts, 5);
      const sampler = sampleOccupied(event.id);
      await sleep(20);
      const results = await burst(Array.from({ length: 30 }, (_, i) => api(event.id, i + 1)));
      await sleep(20);
      const { max, samples } = await sampler.stop();
      expect(tally(results)).toEqual({ ok: 5, sold_out: 25 });
      expect(max).toBe(5);
      expect(samples).toBeGreaterThanOrEqual(5);
    }
  });

  it('F05-CA05 rajada mista vitrine e API respeita a lotação', async () => {
    const accounts = await seedAccounts();
    for (let round = 1; round <= 3; round += 1) {
      const event = await newEvent(accounts, 5);
      const inputs: PurchaseInput[] = [];
      for (let i = 1; i <= 15; i += 1) {
        inputs.push({
          eventId: event.id,
          buyer: { type: 'account', userId: accounts.participante.id },
          cardNumber: CARD_OK,
          channel: 'vitrine',
        });
        inputs.push(api(event.id, i));
      }
      const results = await burst(inputs);
      expect(tally(results)).toEqual({ ok: 5, sold_out: 25 });
      const { rows } = await testDb().query<{ channel: string; ok: boolean }>(
        `SELECT channel, CASE WHEN channel = 'vitrine' THEN buyer_user_id = $2 AND buyer_email = 'participante@catraca.test'
                              ELSE buyer_user_id IS NULL END AS ok
           FROM tickets WHERE event_id = $1`,
        [event.id, accounts.participante.id],
      );
      expect(rows.length).toBe(5);
      expect(rows.every((row) => row.ok)).toBe(true);
    }
  });

  it('F05-CA05 rajadas simultâneas em três eventos vendem exatamente a lotação de cada um', async () => {
    const accounts = await seedAccounts();
    for (let round = 1; round <= 2; round += 1) {
      const events = [await newEvent(accounts, 2), await newEvent(accounts, 5), await newEvent(accounts, 7)];
      // 90 compras intercaladas entre os três eventos, sobre as 60 conexões do pool.
      const inputs = Array.from({ length: 30 }, (_, i) => events.map((event) => api(event.id, i + 1))).flat();
      const results = await burst(inputs);
      const created = events.map((event) => results.filter((result) => result.ok && result.ticket.eventId === event.id).length);
      expect(created).toEqual([2, 5, 7]);
      expect(tally(results)).toEqual({ ok: 14, sold_out: 76 });
      for (const event of events) {
        const { occupied, total } = await occupiedAndTotal(testDb(), event.id);
        expect(occupied).toBe(event.capacity);
        expect(total).toBe(event.capacity);
      }
    }
  });

  it('compra em outro evento não espera a trava do evento ocupado', async () => {
    const accounts = await seedAccounts();
    const a = await newEvent(accounts, 5);
    const b = await newEvent(accounts, 5);
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => {};
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const holder = withTransaction(testDb(), async (client) => {
      await lockEventForUpdate(client, a.id);
      locked();
      await released;
    });
    await isLocked;

    let aDone = false;
    const purchaseA = service.purchase(api(a.id, 1)).then(
      (result) => {
        aDone = true;
        return result;
      },
      (error: unknown) => {
        aDone = true;
        return error;
      },
    );
    let elapsedB: number;
    let aDoneWhileLocked: boolean;
    let aTicketsWhileLocked: number;
    let resultB: PurchaseResult;
    try {
      const start = performance.now();
      resultB = await service.purchase(api(b.id, 2));
      elapsedB = performance.now() - start;
      await sleep(300);
      aDoneWhileLocked = aDone;
      aTicketsWhileLocked = (await occupiedAndTotal(testDb(), a.id)).total;
    } finally {
      release();
      await holder;
    }
    expect(resultB.ok).toBe(true);
    expect(elapsedB).toBeLessThan(500);
    expect(aDoneWhileLocked).toBe(false);
    expect(aTicketsWhileLocked).toBe(0);
    const resultA = (await purchaseA) as PurchaseResult;
    expect(resultA.ok).toBe(true);
    expect(await occupiedAndTotal(testDb(), a.id)).toEqual({ occupied: 1, total: 1 });
  });

  it('CF05 redução de lotação concorrente com a rajada nunca deixa ocupadas acima da lotação final', async () => {
    const { app } = await createTestApp();
    const accounts = await seedAccounts();
    const cookieA = await loginAs(app, 'organizador.a@catraca.test');
    const statuses: number[] = [];
    for (let round = 1; round <= 5; round += 1) {
      const event = await newEvent(accounts, 5);
      const editing = (async () => {
        await sleep(round - 1); // a edição cai em pontos diferentes da rajada
        return postForm(
          app,
          `/organizador/eventos/${event.id}/editar`,
          { ...eventFields({ nome: event.name, local: event.location, lotacao: '3', preco: '10,00' }) },
          cookieA,
        );
      })();
      const [results, edit] = await Promise.all([burst(Array.from({ length: 30 }, (_, i) => api(event.id, i + 1))), editing]);
      statuses.push(edit.statusCode);
      const { rows } = await testDb().query<{ capacity: number }>('SELECT capacity FROM events WHERE id = $1', [event.id]);
      const { occupied, total } = await occupiedAndTotal(testDb(), event.id);
      const created = results.filter((result) => result.ok).length;
      expect(created + results.filter((result) => !result.ok && result.reason === 'sold_out').length).toBe(30);
      expect(total).toBe(created);
      if (edit.statusCode === 302) {
        expect(rows[0]?.capacity, `rodada ${round}`).toBe(3);
        expect(occupied, `rodada ${round}`).toBeLessThanOrEqual(3);
      } else {
        expect(edit.statusCode, `rodada ${round}`).toBe(422);
        expect(edit.body).toContain('A lotação não pode ficar menor que as vagas ocupadas');
        expect(rows[0]?.capacity, `rodada ${round}`).toBe(5);
        expect(occupied, `rodada ${round}`).toBeLessThanOrEqual(5);
      }
    }
    expect(statuses.every((status) => status === 302 || status === 422)).toBe(true);
  });

  it('CF06 cancelamento concorrente com a rajada não deixa ingresso pending nem confirmed', async () => {
    const { app } = await createTestApp();
    const accounts = await seedAccounts();
    const cookieA = await loginAs(app, 'organizador.a@catraca.test');
    for (let round = 1; round <= 5; round += 1) {
      const event = await newEvent(accounts, 5);
      const cancelling = (async () => {
        await sleep(round - 1);
        return postForm(app, `/organizador/eventos/${event.id}/cancelar`, { confirmar: 'sim' }, cookieA);
      })();
      const [results, cancel] = await Promise.all([
        burst(Array.from({ length: 30 }, (_, i) => api(event.id, i + 1))),
        cancelling,
      ]);
      expect(cancel.statusCode, `rodada ${round}`).toBe(302);
      const created = results.filter((result) => result.ok).length;
      const refused = results.filter((result) => !result.ok && (result.reason === 'event_not_available' || result.reason === 'sold_out'));
      expect(created + refused.length, `rodada ${round}`).toBe(30);
      expect(created, `rodada ${round}`).toBeLessThanOrEqual(5);
      const { rows } = await testDb().query<{ status: string; n: number; same_tx: boolean }>(
        `SELECT t.status, count(*) AS n, bool_and(t.status_changed_at = e.cancelled_at) AS same_tx
           FROM tickets t JOIN events e ON e.id = t.event_id WHERE t.event_id = $1 GROUP BY t.status`,
        [event.id],
      );
      expect(rows.filter((row) => row.status === 'pending' || row.status === 'confirmed'), `rodada ${round}`).toEqual([]);
      expect(rows.reduce((sum, row) => sum + row.n, 0)).toBe(created);
      expect(rows.every((row) => row.same_tx)).toBe(true);
    }
  });

  it('a compra que esperou a trava enxerga o ingresso de quem a segurava', async () => {
    const accounts = await seedAccounts();
    for (let round = 1; round <= 3; round += 1) {
      const event = await newEvent(accounts, 1);
      let locked: () => void = () => {};
      const isLocked = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const holder = withTransaction(testDb(), async (client) => {
        const row = await lockEventForUpdate(client, event.id);
        locked();
        await insertTicket(client, {
          id: newId('tkt'),
          eventId: event.id,
          code: `R${String(round).padStart(7, '0')}`,
          pricePaidCents: row?.priceCents ?? 1000,
          channel: 'api',
          buyerUserId: null,
          buyerEmail: 'segurou@example.com',
        });
        await sleep(300);
      });
      await isLocked;
      const result = await service.purchase(api(event.id, 1));
      await holder;
      expect(result).toEqual({ ok: false, reason: 'sold_out' });
      expect(await occupiedAndTotal(testDb(), event.id)).toEqual({ occupied: 1, total: 1 });
    }
  });
});
