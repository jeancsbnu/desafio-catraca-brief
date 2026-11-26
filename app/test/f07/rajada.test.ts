// R07 pela API (spec 7, rajada): compras simultâneas por HTTP real — a aplicação escuta numa porta
// local e recebe 30 requisições TCP disparadas juntas, cada uma numa transação da F05.
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { CARD_OK, SOLD_OUT, PURCHASE_ACCEPTED, buyVitrine, listedEvent, occupiedAndTotal, setup } from './support.js';

interface HttpResult {
  status: number;
  body: string;
}

async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = app.server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

/** Uma compra pela API por HTTP real (sem await: quem chama dispara várias juntas). */
async function post(base: string, key: string, eventId: string, buyerEmail: string): Promise<HttpResult> {
  const response = await fetch(`${base}/api/partner/events/${eventId}/purchases`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ buyerEmail, cardNumber: CARD_OK }),
  });
  return { status: response.status, body: await response.text() };
}

function burst(base: string, key: string, eventId: string, n: number, prefix: string): Promise<HttpResult>[] {
  return Array.from({ length: n }, (_, i) => post(base, key, eventId, `${prefix}${i + 1}@example.com`));
}

function tally(results: readonly HttpResult[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const { status } of results) counts[status] = (counts[status] ?? 0) + 1;
  return counts;
}

describe('F07 rajada de compras pela API', () => {
  it('F07-CA07 CF12 30 compras simultâneas pela API em lotação 5 dão exatamente 5 respostas 202 e 25 409, em 5 rodadas com eventos novos', async () => {
    const { app, db, event } = await setup();
    const base = await listen(app);
    for (let round = 1; round <= 5; round += 1) {
      const e = await event({ capacity: 5, priceCents: 1000 });
      const results = await Promise.all(burst(base, app.config.partnerApiKey, e.id, 30, `carga${round}-`));
      expect(tally(results), `rodada ${round}`).toEqual({ 202: 5, 409: 25 });
      for (const result of results) {
        if (result.status === 202) expect(result.body).toMatch(PURCHASE_ACCEPTED);
        else expect(result.body).toBe(SOLD_OUT);
      }
      expect(await occupiedAndTotal(db, e.id), `rodada ${round}`).toEqual({ occupied: 5, total: 5 });
      const { rows } = await db.query<{ codes: number; buyers: number; api: boolean }>(
        `SELECT count(DISTINCT code) AS codes, count(DISTINCT buyer_email) AS buyers, bool_and(channel = 'api') AS api
           FROM tickets WHERE event_id = $1`,
        [e.id],
      );
      expect(rows[0]).toEqual({ codes: 5, buyers: 5, api: true });
      expect((await listedEvent(app, e.id))?.availableSeats).toBe(0);
    }
  });

  it('CF12 rajadas simultâneas em dois eventos vendem exatamente a lotação de cada um', async () => {
    const { app, db, event } = await setup();
    const base = await listen(app);
    const five = await event({ capacity: 5 });
    const three = await event({ capacity: 3 });
    const key = app.config.partnerApiKey;
    const [a, b] = await Promise.all([
      Promise.all(burst(base, key, five.id, 30, 'cinco-')),
      Promise.all(burst(base, key, three.id, 30, 'tres-')),
    ]);
    expect(tally(a)).toEqual({ 202: 5, 409: 25 });
    expect(tally(b)).toEqual({ 202: 3, 409: 27 });
    expect(await occupiedAndTotal(db, five.id)).toEqual({ occupied: 5, total: 5 });
    expect(await occupiedAndTotal(db, three.id)).toEqual({ occupied: 3, total: 3 });
  });

  it('CF12 rajada pela API junto com compras pelo canal vitrine respeita a lotação', async () => {
    const { app, db, event, participante } = await setup();
    const base = await listen(app);
    for (let round = 1; round <= 3; round += 1) {
      const e = await event({ capacity: 5 });
      const vitrine = Array.from({ length: 15 }, () =>
        buyVitrine(app, e.id, participante.id).then(
          () => 'ok',
          (error: unknown) => (error instanceof Error ? error.message : String(error)),
        ),
      );
      const [apiResults, vitrineResults] = await Promise.all([
        Promise.all(burst(base, app.config.partnerApiKey, e.id, 15, `misto${round}-`)),
        Promise.all(vitrine),
      ]);
      const created = apiResults.filter((r) => r.status === 202).length + vitrineResults.filter((r) => r === 'ok').length;
      expect(created, `rodada ${round}`).toBe(5);
      expect(apiResults.every((r) => r.status === 202 || (r.status === 409 && r.body === SOLD_OUT))).toBe(true);
      expect(vitrineResults.every((r) => r === 'ok' || r === 'compra pela vitrine recusada: sold_out')).toBe(true);
      expect(await occupiedAndTotal(db, e.id)).toEqual({ occupied: 5, total: 5 });
    }
  });
});
