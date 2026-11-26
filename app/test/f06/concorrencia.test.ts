// R07 pela vitrine: envios simultâneos do formulário de compra passam pela garantia de lotação do
// serviço da F05 (trava da linha do evento); a vitrine nunca decide sozinha se há vaga.
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { CARD_OK, ERROR_MESSAGE, get, postPurchase, showcaseRow, signupParticipant } from './support.js';

describe('F06 concorrência na vitrine', () => {
  it('F06-CA03 30 compras simultâneas pela vitrine em lotação 5 resultam em 5 redirecionamentos e 25 Ingressos esgotados, em 3 rodadas com eventos novos', async () => {
    const { app, db } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const { cookie, userId } = await signupParticipant(app);

    for (let round = 1; round <= 3; round += 1) {
      const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id, capacity: 5, priceCents: 1000 });
      const responses = await Promise.all(Array.from({ length: 30 }, () => postPurchase(app, cookie, event.id, CARD_OK)));

      const redirected = responses.filter((response) => response.statusCode === 302);
      const soldOut = responses.filter((response) => response.statusCode === 409);
      expect(redirected, `rodada ${round}`).toHaveLength(5);
      expect(soldOut, `rodada ${round}`).toHaveLength(25);
      for (const response of redirected) expect(response.headers.location).toBe('/meus-ingressos?ok=compra');
      for (const response of soldOut) expect(response.body).toContain(ERROR_MESSAGE('Ingressos esgotados'));

      const { rows } = await db.query<{ total: number; occupied: number; mine: number }>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE status IN ('pending', 'confirmed')) AS occupied,
                count(*) FILTER (WHERE buyer_user_id = $2 AND channel = 'vitrine') AS mine
           FROM tickets WHERE event_id = $1`,
        [event.id, userId],
      );
      expect(rows[0], `rodada ${round}`).toEqual({ total: 5, occupied: 5, mine: 5 });

      const { body } = await get(app, '/');
      expect(showcaseRow(body, event.id)).toMatch(/<td>R\$ 10,00<\/td><td>0<\/td><td>Ingressos esgotados<\/td><\/tr>$/);
    }
  });
});
