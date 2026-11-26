import { describe, expect, it } from 'vitest';
import { withTransaction } from '../../src/db/transaction.js';
import {
  findEventById,
  findEventsByIds,
  isOnSale,
  listEventsOnSale,
  lockEventForUpdate,
} from '../../src/features/eventos/public.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('F04 consultas', () => {
  it('findEventById devolve todos os campos e null para inexistente ou id inválido', async () => {
    const { organizadorA } = await seedAccounts();
    const startsAt = new Date('2031-03-15T00:00:00Z');
    const created = await insertTestEvent(testDb(), {
      organizerId: organizadorA.id,
      name: 'Show de teste',
      startsAt,
      location: 'Bar do Centro',
      capacity: 7,
      priceCents: 12345,
      status: 'cancelado',
    });
    const event = await findEventById(testDb(), created.id);
    expect(event).toEqual(created);
    expect(event?.id).toMatch(/^evt_[a-z0-9]{16}$/);
    expect(event?.organizerId).toBe(organizadorA.id);
    expect(event?.name).toBe('Show de teste');
    expect(event?.startsAt).toBeInstanceOf(Date);
    expect(event?.startsAt.toISOString()).toBe('2031-03-15T00:00:00.000Z');
    expect(event?.location).toBe('Bar do Centro');
    expect(event?.capacity).toBe(7);
    expect(event?.priceCents).toBe(12345);
    expect(event?.status).toBe('cancelado');
    expect(event?.publishedAt).toBeInstanceOf(Date);
    expect(event?.cancelledAt).toBeInstanceOf(Date);
    expect(event?.createdAt).toBeInstanceOf(Date);
    expect(event?.updatedAt).toBeInstanceOf(Date);

    const draft = await insertTestEvent(testDb(), { organizerId: organizadorA.id, status: 'rascunho' });
    const draftRecord = await findEventById(testDb(), draft.id);
    expect(draftRecord?.publishedAt).toBeNull();
    expect(draftRecord?.cancelledAt).toBeNull();

    expect(await findEventById(testDb(), 'evt_0000000000000000')).toBeNull();
    expect(await findEventById(testDb(), 'nao-e-um-id')).toBeNull();
    expect(await findEventById(testDb(), `${created.id}x`)).toBeNull();
  });

  it('listEventsOnSale traz só publicados de todos os organizadores, por data', async () => {
    const { organizadorA, organizadorB } = await seedAccounts();
    const base = Date.now() + 10 * DAY_MS;
    const at = (days: number): Date => new Date(base + days * DAY_MS);
    const a3 = await insertTestEvent(testDb(), { organizerId: organizadorA.id, startsAt: at(3) });
    const b1 = await insertTestEvent(testDb(), { organizerId: organizadorB.id, startsAt: at(1) });
    const a2x = await insertTestEvent(testDb(), { organizerId: organizadorA.id, startsAt: at(2) });
    const b2x = await insertTestEvent(testDb(), { organizerId: organizadorB.id, startsAt: at(2) });
    await insertTestEvent(testDb(), { organizerId: organizadorA.id, startsAt: at(0), status: 'rascunho' });
    await insertTestEvent(testDb(), { organizerId: organizadorB.id, startsAt: at(0), status: 'cancelado' });

    const onSale = await listEventsOnSale(testDb());
    const sameDay = [a2x.id, b2x.id].sort();
    expect(onSale.map((event) => event.id)).toEqual([b1.id, ...sameDay, a3.id]);
    expect(onSale.every((event) => event.status === 'publicado')).toBe(true);
  });

  it('findEventsByIds devolve só os existentes', async () => {
    const { organizadorA, organizadorB } = await seedAccounts();
    const a = await insertTestEvent(testDb(), { organizerId: organizadorA.id, status: 'rascunho' });
    const b = await insertTestEvent(testDb(), { organizerId: organizadorB.id, status: 'cancelado' });
    const found = await findEventsByIds(testDb(), [a.id, 'evt_0000000000000000', b.id, 'invalido', a.id]);
    expect([...found.keys()].sort()).toEqual([a.id, b.id].sort());
    expect(found.get(a.id)).toEqual(a);
    expect(found.get(b.id)).toEqual(b);
    expect((await findEventsByIds(testDb(), [])).size).toBe(0);
  });

  it('isOnSale só é verdadeiro para publicado', () => {
    expect(isOnSale({ status: 'publicado' })).toBe(true);
    expect(isOnSale({ status: 'rascunho' })).toBe(false);
    expect(isOnSale({ status: 'cancelado' })).toBe(false);
  });

  it('lockEventForUpdate segura a linha até o fim da transação', async () => {
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });

    async function tryLockElsewhere(): Promise<unknown> {
      const other = await testDb().connect();
      try {
        await other.query('BEGIN');
        await other.query("SET LOCAL lock_timeout = '150ms'");
        await other.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [event.id]);
        await other.query('ROLLBACK');
        return 'travou';
      } catch (error) {
        await other.query('ROLLBACK');
        return (error as { code?: string }).code;
      } finally {
        other.release();
      }
    }

    await withTransaction(testDb(), async (client) => {
      const locked = await lockEventForUpdate(client, event.id);
      expect(locked).toEqual(event);
      expect(await tryLockElsewhere()).toBe('55P03');
    });
    expect(await tryLockElsewhere()).toBe('travou');

    await withTransaction(testDb(), async (client) => {
      expect(await lockEventForUpdate(client, 'evt_0000000000000000')).toBeNull();
      expect(await lockEventForUpdate(client, 'invalido')).toBeNull();
    });
  });
});
