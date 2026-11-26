// Migration da tabela tickets: restrições, índices e o gatilho de guarda (spec seção 6).
import { describe, expect, it } from 'vitest';
import { newId } from '../../src/core/ids.js';
import type { Db } from '../../src/db/pool.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';

interface Row {
  id?: string;
  event_id?: string;
  code?: string;
  status?: string;
  checked_in?: boolean;
  checked_in_at?: Date | null;
  price_paid_cents?: number;
  channel?: string;
  buyer_user_id?: string | null;
  buyer_email?: string;
}

let counter = 0;
function code(): string {
  counter += 1;
  return `T${String(counter).padStart(7, '0')}`;
}

async function insertRow(db: Db, row: Row): Promise<string> {
  const id = row.id ?? newId('tkt');
  await db.query(
    `INSERT INTO tickets (id, event_id, code, status, checked_in, checked_in_at, price_paid_cents, channel, buyer_user_id, buyer_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      row.event_id,
      row.code ?? code(),
      row.status ?? 'pending',
      row.checked_in ?? false,
      row.checked_in_at ?? null,
      row.price_paid_cents ?? 10000,
      row.channel ?? 'api',
      row.buyer_user_id ?? null,
      row.buyer_email ?? 'ana@example.com',
    ],
  );
  return id;
}

async function errorOf(promise: Promise<unknown>): Promise<{ code?: string; message?: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { code?: string; message?: string };
  }
  throw new Error('era esperado um erro do banco');
}

async function setup() {
  const db = testDb();
  const accounts = await seedAccounts(db);
  const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 10 });
  return { db, accounts, event };
}

describe('F05 modelo de dados: tabela tickets', () => {
  it('a migration cria tickets com as restrições, os índices e o gatilho da spec', async () => {
    const db = testDb();
    const { rows: constraints } = await db.query<{ conname: string }>(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'public.tickets'::regclass ORDER BY conname",
    );
    expect(constraints.map((row) => row.conname)).toEqual(
      expect.arrayContaining([
        'tickets_pkey',
        'tickets_event_id_fkey',
        'tickets_buyer_user_id_fkey',
        'tickets_id_format',
        'tickets_code_format',
        'tickets_status_check',
        'tickets_channel_check',
        'tickets_buyer_by_channel',
        'tickets_buyer_email_format',
        'tickets_price_paid_range',
        'tickets_checked_in_at',
        'tickets_checked_in_status',
      ]),
    );
    const { rows: indexes } = await db.query<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tickets' ORDER BY indexname",
    );
    expect(indexes.map((row) => row.indexname)).toEqual([
      'tickets_buyer_idx',
      'tickets_code_key',
      'tickets_event_status_idx',
      'tickets_pkey',
    ]);
    expect(indexes.find((row) => row.indexname === 'tickets_code_key')?.indexdef).toBe(
      'CREATE UNIQUE INDEX tickets_code_key ON public.tickets USING btree (code)',
    );
    const { rows: triggers } = await db.query<{ tgname: string }>(
      "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.tickets'::regclass AND NOT tgisinternal",
    );
    expect(triggers.map((row) => row.tgname)).toEqual(['tickets_guard_update']);
    const { rows: format } = await db.query<{ def: string }>(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'tickets_code_format'",
    );
    expect(format[0]?.def).toBe("CHECK ((code ~ '^[A-Z0-9]{8}$'::text))");
  });

  it('restrições recusam dados inválidos', async () => {
    const { db, accounts, event } = await setup();
    const p = accounts.participante.id;
    const invalid: Row[] = [
      { event_id: event.id, code: 'k7q2m9xa' },
      { event_id: event.id, code: 'K7Q2M9X' },
      { event_id: event.id, status: 'paid' },
      { event_id: event.id, channel: 'site' },
      { event_id: event.id, channel: 'vitrine' },
      { event_id: event.id, channel: 'api', buyer_user_id: p },
      { event_id: event.id, buyer_email: 'Ana@example.com' },
      { event_id: event.id, buyer_email: 'nao-e-um-email' },
      { event_id: event.id, price_paid_cents: 0 },
      { event_id: event.id, status: 'confirmed', checked_in: true },
      { event_id: event.id, checked_in: true, checked_in_at: new Date() },
      { event_id: event.id, id: 'tkt_curto' },
    ];
    for (const row of invalid) {
      expect((await errorOf(insertRow(db, row))).code, JSON.stringify(row)).toBe('23514');
    }
    await insertRow(db, { event_id: event.id, code: 'K7Q2M9XA' });
    expect((await errorOf(insertRow(db, { event_id: event.id, code: 'K7Q2M9XA' }))).code).toBe('23505');
    expect((await errorOf(insertRow(db, { event_id: 'evt_0000000000000000' }))).code).toBe('23503');
    const { rows } = await db.query<{ n: number }>('SELECT count(*) AS n FROM tickets');
    expect(rows[0]?.n).toBe(1);
  });

  it('F05-CA08 a guarda recusa transições inválidas', async () => {
    const { db, event } = await setup();
    const cases: [string, string][] = [
      ['cancelled', 'confirmed'],
      ['refunded', 'confirmed'],
      ['declined', 'confirmed'],
      ['confirmed', 'pending'],
      ['pending', 'refunded'],
      ['cancelled', 'pending'],
      ['declined', 'cancelled'],
      ['refunded', 'cancelled'],
    ];
    for (const [from, to] of cases) {
      const id = await insertRow(db, { event_id: event.id, status: from });
      const error = await errorOf(db.query('UPDATE tickets SET status = $2 WHERE id = $1', [id, to]));
      expect(error.code).toBe('23514');
      expect(error.message).toBe(`ingressos: transição de status inválida (${from} -> ${to}) no ingresso ${id}`);
      const { rows } = await db.query<{ status: string }>('SELECT status FROM tickets WHERE id = $1', [id]);
      expect(rows[0]?.status).toBe(from);
    }
    const valid: [string, string][] = [
      ['pending', 'confirmed'],
      ['pending', 'declined'],
      ['pending', 'cancelled'],
      ['confirmed', 'refunded'],
    ];
    for (const [from, to] of valid) {
      const id = await insertRow(db, { event_id: event.id, status: from });
      await db.query('UPDATE tickets SET status = $2 WHERE id = $1', [id, to]);
      const { rows } = await db.query<{ status: string }>('SELECT status FROM tickets WHERE id = $1', [id]);
      expect(rows[0]?.status).toBe(to);
    }
  });

  it('a guarda recusa mudança de campos imutáveis e desfazer check-in', async () => {
    const { db, accounts, event } = await setup();
    const other = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const id = await insertRow(db, { event_id: event.id, status: 'confirmed' });
    const changes: [string, unknown][] = [
      ['price_paid_cents', 15000],
      ['code', 'ZZZZZZZY'],
      ['event_id', other.id],
      ['channel', 'vitrine'],
      ['buyer_email', 'outra@example.com'],
      ['created_at', new Date(0)],
    ];
    for (const [column, value] of changes) {
      const error = await errorOf(db.query(`UPDATE tickets SET ${column} = $2 WHERE id = $1`, [id, value]));
      expect(error.code, column).toBe('23514');
      expect(error.message, column).toBe(`ingressos: campo imutável alterado no ingresso ${id}`);
    }

    await db.query('UPDATE tickets SET checked_in = true, checked_in_at = clock_timestamp() WHERE id = $1', [id]);
    const undo = await errorOf(db.query('UPDATE tickets SET checked_in = false, checked_in_at = NULL WHERE id = $1', [id]));
    expect(undo.message).toBe(`ingressos: check-in não pode ser desfeito no ingresso ${id}`);

    const pending = await insertRow(db, { event_id: event.id });
    const early = await errorOf(
      db.query('UPDATE tickets SET checked_in = true, checked_in_at = clock_timestamp() WHERE id = $1', [pending]),
    );
    expect(early.message).toBe(`ingressos: check-in só de ingresso confirmado (${pending})`);

    // O estorno preserva o check-in.
    await db.query("UPDATE tickets SET status = 'refunded' WHERE id = $1", [id]);
    const { rows } = await db.query<{ status: string; checked_in: boolean }>(
      'SELECT status, checked_in FROM tickets WHERE id = $1',
      [id],
    );
    expect(rows[0]).toEqual({ status: 'refunded', checked_in: true });
  });
});
