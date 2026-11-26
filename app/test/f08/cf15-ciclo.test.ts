// CF15 (F05 → F08): compras reais pelo serviço da F05 (app.tickets.purchase), resultado do gateway
// entregue por settlePayments e o check-in lendo o status e o código do ingresso (R09, R10).
import { describe, expect, it } from 'vitest';
import type { PurchaseInput, TicketRecord } from '../../src/features/ingressos/public.js';
import { postCheckIn } from '../helpers/checkin.js';
import { insertTestEvent } from '../helpers/events.js';
import { settlePayments } from '../helpers/tickets.js';
import { setup, ticketMark } from './support.js';

type Setup = Awaited<ReturnType<typeof setup>>;

async function buy(test: Setup, eventId: string, cardNumber: string, channel: 'vitrine' | 'api' = 'api'): Promise<TicketRecord> {
  const input: PurchaseInput =
    channel === 'vitrine'
      ? { eventId, buyer: { type: 'account', userId: test.accounts.participante.id }, cardNumber, channel }
      : { eventId, buyer: { type: 'email', email: 'compra.f08@example.com' }, cardNumber, channel };
  const result = await test.app.tickets.purchase(input);
  if (!result.ok) throw new Error(`compra recusada: ${result.reason}`);
  return result.ticket;
}

describe('F08 CF15 ciclo do ingresso e check-in', () => {
  it('CF15 compra confirmada resulta em Entrada liberada e, de novo, Ingresso já utilizado', async () => {
    const test = await setup();
    const { app, db, accounts, cookieA } = test;
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    for (const channel of ['vitrine', 'api'] as const) {
      const ticket = await buy(test, event.id, '4000000000000001', channel);
      expect(ticket.status).toBe('pending');
      await settlePayments(app, { ticketIds: [ticket.id] });
      expect((await ticketMark(db, ticket.id))?.status).toBe('confirmed');
      expect(await postCheckIn(app, cookieA, event.id, ticket.code), channel).toMatchObject({
        statusCode: 200,
        result: 'liberada',
        message: 'Entrada liberada',
      });
      expect(await postCheckIn(app, cookieA, event.id, ticket.code), channel).toMatchObject({
        statusCode: 200,
        result: 'ja_utilizado',
        message: 'Ingresso já utilizado',
      });
      expect(await ticketMark(db, ticket.id)).toMatchObject({ status: 'confirmed', checked_in: true });
    }
  });

  it('CF15 compra pendente resulta em Ingresso não confirmado e, depois de confirmada, em Entrada liberada', async () => {
    const test = await setup();
    const { app, db, accounts, cookieA } = test;
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const late = await buy(test, event.id, '4000000000000003');
    const lateDeclined = await buy(test, event.id, '4000000000000004');
    for (const ticket of [late, lateDeclined]) {
      expect(await postCheckIn(app, cookieA, event.id, ticket.code)).toMatchObject({
        statusCode: 200,
        result: 'nao_confirmado',
        message: 'Ingresso não confirmado',
      });
      expect(await ticketMark(db, ticket.id)).toMatchObject({ status: 'pending', checked_in: false });
    }
    await settlePayments(app, { ticketIds: [late.id, lateDeclined.id] });
    expect((await ticketMark(db, late.id))?.status).toBe('confirmed');
    expect((await ticketMark(db, lateDeclined.id))?.status).toBe('declined');
    expect((await postCheckIn(app, cookieA, event.id, late.code)).result).toBe('liberada');
    expect((await postCheckIn(app, cookieA, event.id, lateDeclined.code)).result).toBe('nao_confirmado');
  });

  it('CF15 compra recusada resulta em Ingresso não confirmado', async () => {
    const test = await setup();
    const { app, db, accounts, cookieA } = test;
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await buy(test, event.id, '4000000000000002', 'vitrine');
    await settlePayments(app, { ticketIds: [ticket.id] });
    expect((await ticketMark(db, ticket.id))?.status).toBe('declined');
    expect(await postCheckIn(app, cookieA, event.id, ticket.code)).toMatchObject({
      statusCode: 200,
      result: 'nao_confirmado',
      message: 'Ingresso não confirmado',
    });
    expect(await ticketMark(db, ticket.id)).toMatchObject({ status: 'declined', checked_in: false });
  });

  it('CF15 código inexistente ou de compra de outro evento resulta em Ingresso inválido para este evento', async () => {
    const test = await setup();
    const { app, db, accounts, cookieA } = test;
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const other = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const ticket = await buy(test, other.id, '4000000000000001');
    await settlePayments(app, { ticketIds: [ticket.id] });
    for (const code of ['ZZZZZZZZ', ticket.code]) {
      expect(await postCheckIn(app, cookieA, event.id, code), code).toMatchObject({
        statusCode: 200,
        result: 'invalido',
        message: 'Ingresso inválido para este evento',
      });
    }
    expect(await ticketMark(db, ticket.id)).toMatchObject({ status: 'confirmed', checked_in: false });
    expect((await postCheckIn(app, cookieA, other.id, ticket.code)).result).toBe('liberada');
  });
});
