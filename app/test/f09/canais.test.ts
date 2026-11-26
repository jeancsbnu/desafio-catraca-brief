// Vitrine (F06) e API de parceiros (F07) contam juntas no painel (CF19); ingresso da API no
// check-in (F08) com a consulta da API e o painel (CF20). Tudo pelas rotas reais.
import { describe, expect, it } from 'vitest';
import type { PartnerTicket, PurchaseAccepted } from '../../src/features/parceiros/responses.js';
import { postCheckIn } from '../helpers/checkin.js';
import { insertTestEvent } from '../helpers/events.js';
import { partnerPurchase, partnerTicket } from '../helpers/partner.js';
import { settlePayments } from '../helpers/tickets.js';
import { postPurchase } from '../f06/support.js';
import { CARD_OK, panelLine, panelOf, participantCookie, readPanel, setup } from './support.js';

describe('F09 vitrine, API e check-in no painel', () => {
  it('CF19 uma compra confirmada pela vitrine e duas pela API, todas a R$ 100,00, mostram Confirmados 3 e Receita R$ 300,00', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 5, priceCents: 10000 });
    const buyer = await participantCookie(app);

    const showcase = await postPurchase(app, buyer.cookie, event.id, CARD_OK);
    expect(showcase.statusCode).toBe(302);
    expect(showcase.headers.location).toBe('/meus-ingressos?ok=compra');
    for (const email of ['parceiro.1@example.com', 'parceiro.2@example.com']) {
      const api = await partnerPurchase(app, event.id, { buyerEmail: email, cardNumber: CARD_OK });
      expect(api.statusCode).toBe(202);
    }
    expect((await panelOf(app, cookieA, event.id)).line).toBe(panelLine(0, 3, 0, 2, 'R$ 0,00', 0));

    await settlePayments(app);
    const page = await panelOf(app, cookieA, event.id);
    expect(page.line).toBe(panelLine(3, 0, 0, 2, 'R$ 300,00', 0));
    expect(page.revenueCents).toBe(30000);

    const { rows } = await db.query<{ channel: string; status: string; n: number; buyer_ok: boolean }>(
      `SELECT channel, status, count(*) AS n,
              bool_and(CASE WHEN channel = 'vitrine' THEN buyer_user_id = $2 ELSE buyer_user_id IS NULL END) AS buyer_ok
         FROM tickets WHERE event_id = $1 GROUP BY channel, status ORDER BY channel, status`,
      [event.id, buyer.userId],
    );
    expect(rows).toEqual([
      { channel: 'api', status: 'confirmed', n: 2, buyer_ok: true },
      { channel: 'vitrine', status: 'confirmed', n: 1, buyer_ok: true },
    ]);
  });

  it('CF20 ingresso comprado pela API passa no check-in com Entrada liberada, a API mostra "checkedIn":true e o painel mostra Check-ins 1', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 2, priceCents: 3000 });
    const purchase = await partnerPurchase(app, event.id, { buyerEmail: 'cf20@example.com', cardNumber: CARD_OK });
    expect(purchase.statusCode).toBe(202);
    const accepted = purchase.body as PurchaseAccepted;
    await settlePayments(app, { ticketIds: [accepted.ticketId] });

    const before = await partnerTicket(app, accepted.ticketId);
    expect(before.statusCode).toBe(200);
    expect((before.body as PartnerTicket).status).toBe('confirmed');
    expect((before.body as PartnerTicket).checkedIn).toBe(false);
    expect((await panelOf(app, cookieA, event.id)).line).toBe(panelLine(1, 0, 0, 1, 'R$ 30,00', 0));

    const checkIn = await postCheckIn(app, cookieA, event.id, accepted.code);
    expect(checkIn.statusCode).toBe(200);
    expect(checkIn.result).toBe('liberada');
    expect(checkIn.message).toBe('Entrada liberada');
    expect(readPanel(checkIn.body).line).toBe(panelLine(1, 0, 1, 1, 'R$ 30,00', 0));

    const after = await app.inject({
      method: 'GET',
      url: `/api/partner/tickets/${accepted.ticketId}`,
      headers: { 'x-api-key': app.config.partnerApiKey },
    });
    expect(after.statusCode).toBe(200);
    expect(after.body).toContain('"checkedIn":true');
    expect((await partnerTicket(app, accepted.ticketId)).body).toMatchObject({ status: 'confirmed', checkedIn: true });
    expect((await panelOf(app, cookieA, event.id)).line).toBe(panelLine(1, 0, 1, 1, 'R$ 30,00', 0));
  });
});
