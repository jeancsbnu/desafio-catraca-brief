// Tempos do gateway vistos pela consulta da API (R08), com o worker real da F03.
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { createTestApp } from '../helpers/app.js';
import { KEY, PURCHASE_ACCEPTED, sleep } from './support.js';

/** Nenhuma variável de gateway nem de chave (nem as do ambiente do processo de testes). */
const CONFIGURACAO_PADRAO = { GATEWAY_MODE: undefined, GATEWAY_DELAY_SCALE: undefined, PARTNER_API_KEY: undefined };

async function purchase(app: FastifyInstance, eventId: string, cardNumber: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/partner/events/${eventId}/purchases`,
    headers: { 'x-api-key': KEY, 'content-type': 'application/json' },
    payload: JSON.stringify({ buyerEmail: 'ana@example.com', cardNumber }),
  });
  const id = PURCHASE_ACCEPTED.exec(response.body)?.[1];
  if (response.statusCode !== 202 || id === undefined) throw new Error(`compra: ${response.statusCode} ${response.body}`);
  return id;
}

async function statusOf(app: FastifyInstance, ticketId: string): Promise<string> {
  const response = await app.inject({ method: 'GET', url: `/api/partner/tickets/${ticketId}`, headers: { 'x-api-key': KEY } });
  return response.json<{ status: string }>().status;
}

/** Idade do ingresso no relógio do banco, em segundos. */
async function ageOf(app: FastifyInstance, ticketId: string): Promise<number> {
  const { rows } = await app.db.query<{ age: number }>(
    'SELECT EXTRACT(EPOCH FROM clock_timestamp() - created_at)::float8 AS age FROM tickets WHERE id = $1',
    [ticketId],
  );
  return rows[0]?.age ?? -1;
}

/** Espera o ingresso completar `seconds` de vida no relógio do banco. */
async function waitAge(app: FastifyInstance, ticketId: string, seconds: number): Promise<void> {
  for (;;) {
    const remaining = seconds - (await ageOf(app, ticketId));
    if (remaining <= 0) return;
    await sleep(remaining * 1000 + 2);
  }
}

describe('F07 tempos do gateway pela API', () => {
  it('F07-CA10 F07-CA11 com a configuração padrão, a compra pela API com 0001 aparece confirmed na consulta em até 5 s', async () => {
    const { app, db, config } = await createTestApp({ backgroundJobs: true, config: CONFIGURACAO_PADRAO });
    expect(config.gateway).toEqual({ mode: 'simulado', delayScale: 1 });
    expect(config.partnerApiKey).toBe('parceiro-catraca-dev');
    await app.ready();
    const accounts = await seedAccounts();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 5 });

    const sentAt = performance.now();
    const ticketId = await purchase(app, event.id, '4000000000000001');
    let status = await statusOf(app, ticketId);
    expect(status).toBe('pending');
    while (status === 'pending' && performance.now() - sentAt < 6000) {
      await sleep(200);
      status = await statusOf(app, ticketId);
    }
    const observedAfter = (performance.now() - sentAt) / 1000;
    expect(status).toBe('confirmed');
    expect(observedAfter).toBeLessThanOrEqual(5.0);
    const { rows } = await db.query<{ seconds: number }>(
      'SELECT EXTRACT(EPOCH FROM status_changed_at - created_at)::float8 AS seconds FROM tickets WHERE id = $1',
      [ticketId],
    );
    expect(rows[0]?.seconds).toBeGreaterThanOrEqual(2.0);
    expect(rows[0]?.seconds).toBeLessThanOrEqual(5.0);
  });

  it('F07-CA10 com escala 0,1, 0004 continua pending aos 2,9 s e fica declined até 4,5 s', async () => {
    const { app, db } = await createTestApp({ config: { GATEWAY_DELAY_SCALE: '0.1', PARTNER_API_KEY: undefined } });
    expect(app.gateway.escala).toBe(0.1);
    app.gateway.iniciarWorker({ intervaloMs: 20 });
    const accounts = await seedAccounts();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 2 });
    const ticketId = await purchase(app, event.id, '4000000000000004');

    await waitAge(app, ticketId, 2.9);
    expect(await statusOf(app, ticketId)).toBe('pending');
    expect(await ageOf(app, ticketId)).toBeGreaterThanOrEqual(2.9);

    await waitAge(app, ticketId, 4.5);
    expect(await statusOf(app, ticketId)).toBe('declined');
    await app.gateway.pararWorker();
  });
});
