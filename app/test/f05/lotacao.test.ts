// Provedor de vagas ocupadas na validação de lotação mínima da edição da F04 (spec 5.6, CF05).
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { EventRecord } from '../../src/features/eventos/public.js';
import { createTestApp } from '../helpers/app.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { insertTestTicket, settlePayments } from '../helpers/tickets.js';
import { eventFields, postForm } from '../f04/support.js';
import { CARD_OK } from './support.js';

const BELOW_OCCUPIED = 'A lotação não pode ficar menor que as vagas ocupadas';

async function setup(capacity = 3) {
  const test = await createTestApp();
  const accounts = await seedAccounts();
  const cookieA = await loginAs(test.app, 'organizador.a@catraca.test');
  const event = await insertTestEvent(test.db, { organizerId: accounts.organizadorA.id, capacity });
  return { ...test, ...accounts, cookieA, event };
}

function edit(app: FastifyInstance, event: EventRecord, capacity: number, cookie: string) {
  return postForm(
    app,
    `/organizador/eventos/${event.id}/editar`,
    { ...eventFields({ nome: event.name, local: event.location, lotacao: String(capacity), preco: '100,00' }) },
    cookie,
  );
}

async function capacityOf(app: FastifyInstance, id: string): Promise<number | undefined> {
  const { rows } = await app.db.query<{ capacity: number }>('SELECT capacity FROM events WHERE id = $1', [id]);
  return rows[0]?.capacity;
}

async function buy(app: FastifyInstance, eventId: string, cardNumber: string) {
  return app.tickets.purchase({ eventId, buyer: { type: 'email', email: 'ana@example.com' }, cardNumber, channel: 'api' });
}

describe('F05 lotação mínima com as vagas ocupadas reais', () => {
  it('CF05 reduzir a lotação abaixo das vagas ocupadas é rejeitado com a mensagem exata e nada muda', async () => {
    const { app, cookieA, event } = await setup(3);
    const first = await buy(app, event.id, CARD_OK);
    if (first.ok) await settlePayments(app, { ticketIds: [first.ticket.id] });
    expect((await buy(app, event.id, '4000000000000003')).ok).toBe(true);
    const response = await edit(app, event, 1, cookieA);
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain(BELOW_OCCUPIED);
    expect(await capacityOf(app, event.id)).toBe(3);
  });

  it('CF05 lotação igual às vagas ocupadas e maior são aceitas', async () => {
    const { app, cookieA, event } = await setup(3);
    expect((await buy(app, event.id, CARD_OK)).ok).toBe(true);
    expect((await buy(app, event.id, '4000000000000003')).ok).toBe(true);
    const equal = await edit(app, event, 2, cookieA);
    expect(equal.statusCode).toBe(302);
    expect(equal.headers.location).toBe(`/organizador/eventos/${event.id}?ok=atualizado`);
    expect(await capacityOf(app, event.id)).toBe(2);
    expect(await buy(app, event.id, CARD_OK)).toEqual({ ok: false, reason: 'sold_out' });
    const bigger = await edit(app, event, 4, cookieA);
    expect(bigger.statusCode).toBe(302);
    expect(await capacityOf(app, event.id)).toBe(4);
    expect((await buy(app, event.id, CARD_OK)).ok).toBe(true);
  });

  it('CF05 declined, cancelled e refunded não contam na lotação mínima', async () => {
    const { app, db, cookieA, event } = await setup(3);
    for (const status of ['declined', 'cancelled', 'refunded'] as const) {
      await insertTestTicket(db, { eventId: event.id, status });
    }
    const response = await edit(app, event, 1, cookieA);
    expect(response.statusCode).toBe(302);
    expect(await capacityOf(app, event.id)).toBe(1);
  });
});
