// Leitura do painel num instantâneo único, somente leitura e sem esperar travas (spec 5.4), e a
// coerência dos números durante rajadas reais de compras (R05, R07).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db, DbClient } from '../../src/db/pool.js';
import { lockEventForUpdate } from '../../src/features/eventos/public.js';
import type { PurchaseResult, TicketService } from '../../src/features/ingressos/public.js';
import { loadEventPanel } from '../../src/features/painel/metrics.js';
import type { EventPanel } from '../../src/features/painel/types.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { insertTestTicket, settlePayments } from '../helpers/tickets.js';
import { postForm } from '../f04/support.js';
import { serviceOn, warmPool } from '../f05/support.js';
import { CARD_OK, panelLine, panelOf, setup } from './support.js';

type QueryFn = (...args: unknown[]) => Promise<unknown>;

/**
 * Db de teste: o cliente da transação do painel roda `after(client)` logo depois da consulta do
 * evento (findEventById), uma única vez, antes da consulta dos ingressos.
 */
function dbWithHookAfterEventQuery(base: Db, after: (client: DbClient) => Promise<void>): Db {
  let fired = false;
  const connect = async (): Promise<DbClient> => {
    const client = await base.connect();
    return new Proxy(client, {
      get(target, property) {
        if (property === 'query') {
          const query: QueryFn = async (...args) => {
            const result = await (target.query as unknown as QueryFn).apply(target, args);
            const text = typeof args[0] === 'string' ? args[0] : '';
            if (!fired && /\bFROM events WHERE id = \$1$/.test(text.trim())) {
              fired = true;
              await after(target);
            }
            return result;
          };
          return query;
        }
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
  };
  return { connect } as unknown as Db;
}

let burstPool: Db;
let service: TicketService;

// 40 conexões para as compras simultâneas, mais o pool de teste (10) para as leituras.
beforeAll(async () => {
  burstPool = await warmPool(40);
  service = serviceOn(burstPool);
});

afterAll(async () => {
  await burstPool.end();
});

describe('F09 consistência da leitura do painel', () => {
  it('CF17 evento e ingressos são lidos no mesmo instantâneo: um cancelamento confirmado entre as duas leituras não mistura números', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 5, priceCents: 5000 });
    await insertTestTicket(db, { eventId: event.id, status: 'confirmed', pricePaidCents: 5000 });
    await insertTestTicket(db, { eventId: event.id, status: 'pending', pricePaidCents: 5000 });

    let cancelledBetween = false;
    const hooked = dbWithHookAfterEventQuery(testDb(), async () => {
      // Outra conexão confirma o cancelamento (F04 + efeitos da F05) entre as duas consultas.
      const response = await postForm(app, `/organizador/eventos/${event.id}/cancelar`, { confirmar: 'sim' }, cookieA);
      expect(response.statusCode).toBe(302);
      const { rows } = await db.query<{ status: string }>('SELECT status FROM tickets WHERE event_id = $1 ORDER BY status', [
        event.id,
      ]);
      expect(rows.map((row) => row.status)).toEqual(['cancelled', 'refunded']);
      cancelledBetween = true;
    });

    const during = await loadEventPanel(hooked, event.id);
    expect(cancelledBetween).toBe(true);
    // Estado anterior inteiro: publicado, 1 confirmado e 1 pendente.
    expect(during).toEqual<EventPanel>({ confirmed: 1, pending: 1, checkIns: 0, availableSeats: 3, revenueCents: 5000, refunded: 0 });
    // A leitura seguinte mostra o estado novo inteiro.
    expect(await loadEventPanel(testDb(), event.id)).toEqual<EventPanel>({
      confirmed: 0,
      pending: 0,
      checkIns: 0,
      availableSeats: 0,
      revenueCents: 0,
      refunded: 1,
    });
    expect((await panelOf(app, cookieA, event.id)).line).toBe(panelLine(0, 0, 0, 0, 'R$ 0,00', 1));
  });

  it('a leitura do painel é somente leitura e não espera a trava do evento', async () => {
    const { db, accounts } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 4, priceCents: 1000 });
    await insertTestTicket(db, { eventId: event.id, status: 'confirmed', pricePaidCents: 1000 });

    const settings: Record<string, string> = {};
    const inspected = dbWithHookAfterEventQuery(testDb(), async (client) => {
      for (const name of ['transaction_read_only', 'transaction_isolation']) {
        const { rows } = await client.query<Record<string, string>>(`SHOW ${name}`);
        settings[name] = rows[0]?.[name] ?? '';
      }
    });
    await loadEventPanel(inspected, event.id);
    expect(settings).toEqual({ transaction_read_only: 'on', transaction_isolation: 'repeatable read' });

    // Outra transação segura a trava do evento (como compra, edição, cancelamento ou check-in).
    const holder = await testDb().connect();
    try {
      await holder.query('BEGIN');
      expect(await lockEventForUpdate(holder, event.id)).not.toBeNull();
      const started = performance.now();
      const panel = await loadEventPanel(testDb(), event.id);
      const elapsed = performance.now() - started;
      expect(panel).toEqual<EventPanel>({ confirmed: 1, pending: 0, checkIns: 0, availableSeats: 3, revenueCents: 1000, refunded: 0 });
      expect(elapsed).toBeLessThan(500);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });

  it('R05 R07 durante 30 compras simultâneas em lotação 5, toda leitura do painel tem Pendentes + Confirmados ≤ 5 e Vagas = 5 − Pendentes − Confirmados', async () => {
    const { app, db, accounts, cookieA } = await setup();
    for (let round = 1; round <= 3; round += 1) {
      const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 5, priceCents: 1000 });
      const readings: EventPanel[] = [];
      let running = true;
      const reader = (async () => {
        while (running) readings.push(await loadEventPanel(testDb(), event.id));
      })();
      const results: PurchaseResult[] = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          service.purchase({
            eventId: event.id,
            buyer: { type: 'email', email: `carga${i + 1}@example.com` },
            cardNumber: CARD_OK,
            channel: 'api',
          }),
        ),
      );
      running = false;
      await reader;
      readings.push(await loadEventPanel(testDb(), event.id));

      const tally = { ok: 0, soldOut: 0, other: 0 };
      for (const result of results) {
        if (result.ok) tally.ok += 1;
        else if (result.reason === 'sold_out') tally.soldOut += 1;
        else tally.other += 1;
      }
      expect(tally, `rodada ${round}`).toEqual({ ok: 5, soldOut: 25, other: 0 });
      expect(readings.length, `rodada ${round}`).toBeGreaterThan(1);
      for (const reading of readings) {
        expect(reading.pending + reading.confirmed, `rodada ${round}`).toBeLessThanOrEqual(5);
        expect(reading.availableSeats, `rodada ${round}`).toBe(5 - reading.pending - reading.confirmed);
        expect(reading.revenueCents, `rodada ${round}`).toBe(reading.confirmed * 1000);
      }
      expect(readings.at(-1), `rodada ${round}`).toEqual<EventPanel>({
        confirmed: 0,
        pending: 5,
        checkIns: 0,
        availableSeats: 0,
        revenueCents: 0,
        refunded: 0,
      });

      // Os resultados do gateway chegam: o painel da página mostra os 5 confirmados.
      await settlePayments(app);
      expect((await panelOf(app, cookieA, event.id)).line, `rodada ${round}`).toBe(panelLine(5, 0, 0, 0, 'R$ 50,00', 0));
    }
  });
});
