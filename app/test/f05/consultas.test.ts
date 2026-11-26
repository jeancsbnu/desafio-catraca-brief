// Consultas que F06–F09 consomem, vagas (R05), resumo por status e check-in atômico (spec 5.1, 5.6, 5.7).
import { describe, expect, it } from 'vitest';
import {
  computeAvailableSeats,
  countOccupiedSeats,
  countOccupiedSeatsByEvent,
  findTicketByCode,
  findTicketById,
  getSeatAvailability,
  getSeatAvailabilityForEvents,
  listTicketsByBuyer,
  listTicketsByEvent,
  markTicketCheckedIn,
  summarizeEventTickets,
} from '../../src/features/ingressos/public.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { warmPool } from './support.js';

async function setup() {
  const db = testDb();
  const accounts = await seedAccounts(db);
  const event = (capacity = 5, status: 'rascunho' | 'publicado' | 'cancelado' = 'publicado') =>
    insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity, status });
  return { db, ...accounts, event };
}

const minutesAgo = (n: number): Date => new Date(Date.now() - n * 60_000);

describe('F05 consultas, vagas e check-in', () => {
  it('findTicketById devolve o registro completo e null para inexistente ou id inválido', async () => {
    const { db, event, participante } = await setup();
    const e = await event();
    const inserted = await insertTestTicket(db, {
      eventId: e.id,
      buyerUserId: participante.id,
      status: 'confirmed',
      checkedIn: true,
      pricePaidCents: 12345,
      code: 'K7Q2M9XA',
    });
    const found = await findTicketById(db, inserted.id);
    expect(found).toEqual({
      id: inserted.id,
      code: 'K7Q2M9XA',
      eventId: e.id,
      status: 'confirmed',
      checkedIn: true,
      checkedInAt: expect.any(Date) as Date,
      pricePaidCents: 12345,
      channel: 'vitrine',
      buyerUserId: participante.id,
      buyerEmail: 'participante@catraca.test',
      createdAt: expect.any(Date) as Date,
      statusChangedAt: expect.any(Date) as Date,
    });
    expect(await findTicketById(db, 'tkt_0000000000000000')).toBeNull();
    expect(await findTicketById(db, 'K7Q2M9XA')).toBeNull();
    expect(await findTicketById(db, '')).toBeNull();
  });

  it('F05-CA06 findTicketByCode normaliza espaços e minúsculas', async () => {
    const { db, event } = await setup();
    const e = await event();
    const ticket = await insertTestTicket(db, { eventId: e.id, code: 'K7Q2M9XA' });
    expect((await findTicketByCode(db, ' k7q2m9xa '))?.id).toBe(ticket.id);
    expect((await findTicketByCode(db, 'K7Q2M9XA'))?.id).toBe(ticket.id);
    for (const code of ['ZZZZZZZZ', 'K7Q2M9X', 'K7Q2-M9XA', '', '   ']) {
      expect(await findTicketByCode(db, code), code).toBeNull();
    }
  });

  it('listTicketsByBuyer devolve só os ingressos da conta, do mais recente para o mais antigo, sem os da API', async () => {
    const { db, event, participante } = await setup();
    const e1 = await event();
    const e2 = await event();
    const old = await insertTestTicket(db, { eventId: e1.id, buyerUserId: participante.id, createdAt: minutesAgo(30) });
    const recent = await insertTestTicket(db, { eventId: e2.id, buyerUserId: participante.id, createdAt: minutesAgo(5) });
    const middle = await insertTestTicket(db, {
      eventId: e1.id,
      buyerUserId: participante.id,
      status: 'declined',
      createdAt: minutesAgo(10),
    });
    await insertTestTicket(db, { eventId: e1.id, buyerEmail: 'participante@catraca.test' });
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (id, name, email, password_hash, role)
       VALUES ('usr_outraconta000000','Outra', 'outra@catraca.test', 'x', 'participante') RETURNING id`,
    );
    await insertTestTicket(db, { eventId: e1.id, buyerUserId: rows[0]?.id });
    const list = await listTicketsByBuyer(db, participante.id);
    expect(list.map((ticket) => ticket.id)).toEqual([recent.id, middle.id, old.id]);
    expect(await listTicketsByBuyer(db, 'usr_0000000000000000')).toEqual([]);
  });

  it('listTicketsByEvent devolve os ingressos do evento de todos os canais', async () => {
    const { db, event, participante } = await setup();
    const e = await event();
    const other = await event();
    const a = await insertTestTicket(db, { eventId: e.id, buyerUserId: participante.id, createdAt: minutesAgo(3) });
    const b = await insertTestTicket(db, { eventId: e.id, createdAt: minutesAgo(2) });
    await insertTestTicket(db, { eventId: other.id });
    const list = await listTicketsByEvent(db, e.id);
    expect(list.map((ticket) => [ticket.id, ticket.channel])).toEqual([
      [a.id, 'vitrine'],
      [b.id, 'api'],
    ]);
  });

  it('getSeatAvailability e getSeatAvailabilityForEvents seguem R05', async () => {
    const { db, event } = await setup();
    const published = await event(5);
    const draft = await event(4, 'rascunho');
    const cancelled = await event(3, 'cancelado');
    const full = await event(2);
    for (const status of ['pending', 'confirmed', 'declined', 'cancelled', 'refunded'] as const) {
      await insertTestTicket(db, { eventId: published.id, status });
    }
    await insertTestTicket(db, { eventId: cancelled.id, status: 'refunded' });
    await insertTestTicket(db, { eventId: full.id, status: 'confirmed' });
    await insertTestTicket(db, { eventId: full.id, status: 'pending' });

    expect(await getSeatAvailability(db, published.id)).toEqual({
      eventId: published.id,
      eventStatus: 'publicado',
      capacity: 5,
      occupied: 2,
      available: 3,
    });
    expect(await getSeatAvailability(db, draft.id)).toMatchObject({ occupied: 0, available: 4 });
    expect(await getSeatAvailability(db, cancelled.id)).toMatchObject({ eventStatus: 'cancelado', occupied: 0, available: 0 });
    expect(await getSeatAvailability(db, full.id)).toMatchObject({ occupied: 2, available: 0 });
    expect(await getSeatAvailability(db, 'evt_0000000000000000')).toBeNull();
    expect(await getSeatAvailability(db, 'nao-e-um-evento')).toBeNull();

    const map = await getSeatAvailabilityForEvents(db, [published, draft, cancelled, full]);
    expect([...map.keys()]).toEqual([published.id, draft.id, cancelled.id, full.id]);
    expect([...map.values()].map((seats) => seats.available)).toEqual([3, 4, 0, 0]);
    expect((await getSeatAvailabilityForEvents(db, [])).size).toBe(0);

    expect(await countOccupiedSeats(db, published.id)).toBe(2);
    const counts = await countOccupiedSeatsByEvent(db, [published.id, draft.id, full.id, 'evt_0000000000000000']);
    expect(Object.fromEntries(counts)).toEqual({ [published.id]: 2, [draft.id]: 0, [full.id]: 2, evt_0000000000000000: 0 });

    expect(computeAvailableSeats({ capacity: 5, status: 'publicado' }, 2)).toBe(3);
    expect(computeAvailableSeats({ capacity: 5, status: 'publicado' }, 7)).toBe(0);
    expect(computeAvailableSeats({ capacity: 5, status: 'cancelado' }, 0)).toBe(0);
    expect(computeAvailableSeats({ capacity: 5, status: 'rascunho' }, 0)).toBe(5);
  });

  it('summarizeEventTickets conta por status, check-ins de confirmados e a soma paga dos confirmados', async () => {
    const { db, event } = await setup();
    const e = await event(20);
    const empty = await event();
    const mix: [Parameters<typeof insertTestTicket>[1]['status'], number, boolean][] = [
      ['pending', 10000, false],
      ['pending', 10000, false],
      ['confirmed', 10000, false],
      ['confirmed', 15000, true],
      ['confirmed', 15000, false],
      ['declined', 10000, false],
      ['cancelled', 10000, false],
      ['refunded', 10000, true],
      ['refunded', 10000, false],
    ];
    for (const [status, pricePaidCents, checkedIn] of mix) {
      await insertTestTicket(db, { eventId: e.id, status, pricePaidCents, checkedIn });
    }
    expect(await summarizeEventTickets(db, e.id)).toEqual({
      pending: 2,
      confirmed: 3,
      declined: 1,
      cancelled: 1,
      refunded: 2,
      confirmedCheckedIn: 1,
      confirmedPaidCents: 40000,
    });
    expect(await summarizeEventTickets(db, empty.id)).toEqual({
      pending: 0,
      confirmed: 0,
      declined: 0,
      cancelled: 0,
      refunded: 0,
      confirmedCheckedIn: 0,
      confirmedPaidCents: 0,
    });
  });

  it('markTicketCheckedIn marca só confirmed e só uma vez', async () => {
    const { db, event } = await setup();
    const e = await event();
    for (const status of ['pending', 'declined', 'cancelled', 'refunded'] as const) {
      const ticket = await insertTestTicket(db, { eventId: e.id, status });
      expect(await markTicketCheckedIn(db, ticket.id), status).toEqual({ updated: false, ticket });
    }
    const confirmed = await insertTestTicket(db, { eventId: e.id, status: 'confirmed' });
    const first = await markTicketCheckedIn(db, confirmed.id);
    expect(first.updated).toBe(true);
    expect(first.ticket).toMatchObject({ id: confirmed.id, status: 'confirmed', checkedIn: true });
    expect(first.ticket?.checkedInAt).toBeInstanceOf(Date);
    const second = await markTicketCheckedIn(db, confirmed.id);
    expect(second).toEqual({ updated: false, ticket: first.ticket });
    expect(await markTicketCheckedIn(db, 'tkt_0000000000000000')).toEqual({ updated: false, ticket: null });
    expect(await markTicketCheckedIn(db, 'K7Q2M9XA')).toEqual({ updated: false, ticket: null });
  });

  it('dois check-ins simultâneos do mesmo ingresso: um atualiza e o outro não', async () => {
    const { db, event } = await setup();
    const e = await event(20);
    const pool = await warmPool(4);
    try {
      for (let round = 1; round <= 10; round += 1) {
        const ticket = await insertTestTicket(db, { eventId: e.id, status: 'confirmed' });
        const results = await Promise.all([markTicketCheckedIn(pool, ticket.id), markTicketCheckedIn(pool, ticket.id)]);
        expect(results.filter((result) => result.updated).length, `rodada ${round}`).toBe(1);
        const loser = results.find((result) => !result.updated);
        expect(loser?.ticket).toMatchObject({ id: ticket.id, checkedIn: true });
      }
    } finally {
      await pool.end();
    }
  });
});
