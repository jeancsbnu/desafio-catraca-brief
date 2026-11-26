import { describe, expect, it } from 'vitest';
import { newId } from '../../src/core/ids.js';
import { testDb } from '../helpers/db.js';
import { seedAccounts } from '../helpers/seed.js';

interface Row {
  id?: string;
  organizer_id?: string;
  name?: string;
  location?: string;
  capacity?: number;
  price_cents?: number;
  status?: string;
  published_at?: Date | null;
  cancelled_at?: Date | null;
}

async function insertRow(organizerId: string, row: Row): Promise<void> {
  const values = {
    id: newId('evt'),
    organizer_id: organizerId,
    name: 'Evento',
    location: 'Local',
    capacity: 10,
    price_cents: 10000,
    status: 'rascunho',
    published_at: null,
    cancelled_at: null,
    ...row,
  };
  await testDb().query(
    `INSERT INTO events (id, organizer_id, name, starts_at, location, capacity, price_cents, status, published_at, cancelled_at)
     VALUES ($1, $2, $3, now() + interval '30 days', $4, $5, $6, $7, $8, $9)`,
    [
      values.id,
      values.organizer_id,
      values.name,
      values.location,
      values.capacity,
      values.price_cents,
      values.status,
      values.published_at,
      values.cancelled_at,
    ],
  );
}

describe('F04 modelo', () => {
  it('restrições da tabela events recusam dados inválidos', async () => {
    const { organizadorA } = await seedAccounts();
    const insert = (row: Row): Promise<void> => insertRow(organizadorA.id, row);
    await expect(insert({})).resolves.toBeUndefined();
    const now = new Date();
    const invalid: Row[] = [
      { capacity: 0 },
      { capacity: 1_000_001 },
      { price_cents: 0 },
      { price_cents: 100_000_001 },
      { status: 'arquivado' },
      { id: 'evt_curto' },
      { id: 'EVT_AAAAAAAAAAAAAAAA' },
      { status: 'publicado', published_at: null },
      { status: 'rascunho', published_at: now },
      { status: 'rascunho', cancelled_at: now },
      { status: 'publicado', published_at: now, cancelled_at: now },
      { status: 'cancelado', published_at: now, cancelled_at: null },
      { name: 'x'.repeat(121) },
      { name: '' },
      { location: 'x'.repeat(201) },
      { location: '' },
    ];
    for (const row of invalid) {
      await expect(insert(row), JSON.stringify(row)).rejects.toMatchObject({ code: '23514' });
    }
    await expect(insert({ organizer_id: 'usr_inexistente0000' })).rejects.toMatchObject({ code: '23503' });
    await expect(
      insert({ status: 'cancelado', published_at: now, cancelled_at: now, name: 'x'.repeat(120), location: 'y'.repeat(200) }),
    ).resolves.toBeUndefined();
  });

  it('status padrão é rascunho e os momentos de criação e alteração são preenchidos', async () => {
    const { organizadorA } = await seedAccounts();
    const id = newId('evt');
    await testDb().query(
      `INSERT INTO events (id, organizer_id, name, starts_at, location, capacity, price_cents)
       VALUES ($1, $2, 'Evento', now() + interval '1 day', 'Local', 2, 10000)`,
      [id, organizadorA.id],
    );
    const { rows } = await testDb().query<{ status: string; ok: boolean }>(
      `SELECT status, (created_at IS NOT NULL AND updated_at IS NOT NULL AND published_at IS NULL AND cancelled_at IS NULL) AS ok
         FROM events WHERE id = $1`,
      [id],
    );
    expect(rows).toEqual([{ status: 'rascunho', ok: true }]);
  });
});
