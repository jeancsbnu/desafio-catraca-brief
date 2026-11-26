// CF09 (F05 → F06): a compra pela vitrine passa pelo serviço de compra (nasce pendente, fica
// confirmado em até 5 s com o worker real e os tempos padrão); quando o serviço indica 0 vagas, a
// vitrine exibe Ingressos esgotados, e a recusa do gateway devolve a vaga e o formulário.
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { settlePayments } from '../helpers/tickets.js';
import {
  CARD_OK,
  SOLD_OUT_BLOCK,
  formBlock,
  get,
  postPurchase,
  purchaseBlock,
  showcaseRow,
  signupParticipant,
  ticketRows,
} from './support.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('F06 CF09 serviço de compra', () => {
  it('CF09 com o worker real e os tempos padrão, a compra pela vitrine nasce pendente e fica confirmado em até 5 s', async () => {
    const { app, db, config } = await createTestApp({
      backgroundJobs: true,
      config: { GATEWAY_MODE: undefined, GATEWAY_DELAY_SCALE: undefined },
    });
    expect(config.gateway).toEqual({ mode: 'simulado', delayScale: 1 });
    await app.ready();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });
    const buyer = await signupParticipant(app);

    expect((await postPurchase(app, buyer.cookie, event.id, CARD_OK)).statusCode).toBe(302);
    const first = await get(app, '/meus-ingressos?ok=compra', buyer.cookie);
    expect(ticketRows(first.body).map((row) => row.label)).toEqual(['pendente']);

    let label = 'pendente';
    let age = 0;
    for (;;) {
      await sleep(250);
      const { rows } = await db.query<{ age: number }>(
        'SELECT EXTRACT(EPOCH FROM clock_timestamp() - created_at)::float8 AS age FROM tickets WHERE event_id = $1',
        [event.id],
      );
      age = rows[0]?.age ?? 0;
      label = ticketRows((await get(app, '/meus-ingressos', buyer.cookie)).body)[0]?.label ?? '';
      if (label !== 'pendente' || age > 5.5) break;
    }
    expect(label).toBe('confirmado');
    // Visto na página até ~0,5 s depois da entrega (intervalo da consulta); a janela exata vem do banco.
    expect(age).toBeLessThanOrEqual(5.5);
    const { rows } = await db.query<{ seconds: number }>(
      'SELECT EXTRACT(EPOCH FROM status_changed_at - created_at)::float8 AS seconds FROM tickets WHERE event_id = $1',
      [event.id],
    );
    expect(rows[0]?.seconds).toBeGreaterThanOrEqual(2);
    expect(rows[0]?.seconds).toBeLessThanOrEqual(5);
  });

  it('CF09 quando o serviço indica 0 vagas, a vitrine exibe Ingressos esgotados; a recusa libera a vaga e o formulário volta', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id, capacity: 1 });
    const buyer = await signupParticipant(app);

    const other = await app.tickets.purchase({
      eventId: event.id,
      buyer: { type: 'email', email: 'terceiro@example.com' },
      cardNumber: '4000000000000004',
      channel: 'api',
    });
    expect(other.ok).toBe(true);

    const showcase = await get(app, '/');
    expect(showcaseRow(showcase.body, event.id)).toMatch(/<td>0<\/td><td>Ingressos esgotados<\/td><\/tr>$/);
    const page = await get(app, `/eventos/${event.id}`, buyer.cookie);
    expect(purchaseBlock(page.body)).toEqual({ kind: 'esgotado', html: SOLD_OUT_BLOCK });

    await settlePayments(app);
    const { rows } = await testDb().query<{ status: string }>('SELECT status FROM tickets WHERE event_id = $1', [event.id]);
    expect(rows).toEqual([{ status: 'declined' }]);

    const freed = await get(app, '/');
    expect(showcaseRow(freed.body, event.id)).toContain(`<td>1</td><td><a href="/eventos/${event.id}">Comprar</a></td></tr>`);
    const again = await get(app, `/eventos/${event.id}`, buyer.cookie);
    expect(again.body).toContain('<dt>Vagas disponíveis</dt><dd>1</dd>');
    expect(purchaseBlock(again.body)).toEqual({ kind: 'formulario', html: formBlock(event.id) });
  });
});
