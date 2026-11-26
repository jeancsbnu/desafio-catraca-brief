// CF07 (F02 → F06): comprar na vitrine exige sessão de participante; o visitante vai a /entrar e
// volta ao evento depois do login; "Meus ingressos" de uma conta nunca mostra ingressos de outra.
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { postForm } from '../f04/support.js';
import { CARD_OK, formBlock, get, postPurchase, purchaseBlock, signupParticipant, ticketRows } from './support.js';

describe('F06 CF07 acesso', () => {
  it('CF07 visitante clica em Entrar para comprar, entra como participante e volta ao evento com o formulário', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });
    const account = await signupParticipant(app, { email: 'volta-f06@example.com' });

    const page = await get(app, `/eventos/${event.id}`);
    const href = /<p><a href="(\/entrar\?voltar=[^"]+)">Entrar para comprar<\/a><\/p>/.exec(page.body)?.[1];
    expect(href).toBe(`/entrar?voltar=%2Feventos%2F${event.id}`);

    const login = await get(app, href ?? '');
    expect(login.statusCode).toBe(200);
    expect(login.body).toContain(`<input type="hidden" name="voltar" value="/eventos/${event.id}">`);

    const entered = await postForm(app, '/entrar', { email: account.email, senha: 'segredo123', voltar: `/eventos/${event.id}` });
    expect(entered.statusCode).toBe(302);
    expect(entered.headers.location).toBe(`/eventos/${event.id}`);
    const header = entered.headers['set-cookie'];
    const cookie = (Array.isArray(header) ? header[0] : header)?.split(';')[0] ?? '';

    const back = await get(app, `/eventos/${event.id}`, cookie);
    expect(purchaseBlock(back.body)).toEqual({ kind: 'formulario', html: formBlock(event.id) });
    const bought = await postPurchase(app, cookie, event.id, CARD_OK);
    expect(bought.headers.location).toBe('/meus-ingressos?ok=compra');
  });

  it('CF07 Meus ingressos de uma conta nunca mostra ingressos de outra', async () => {
    const { app } = await createTestApp();
    const { organizadorA } = await seedAccounts();
    const event = await insertTestEvent(testDb(), { organizerId: organizadorA.id });
    const ana = await signupParticipant(app, { name: 'Ana' });
    const bia = await signupParticipant(app, { name: 'Bia' });
    for (const account of [ana, bia, ana]) expect((await postPurchase(app, account.cookie, event.id, CARD_OK)).statusCode).toBe(302);

    const { rows } = await testDb().query<{ code: string; buyer_user_id: string }>(
      'SELECT code, buyer_user_id FROM tickets WHERE event_id = $1',
      [event.id],
    );
    const codes = (userId: string): string[] => rows.filter((row) => row.buyer_user_id === userId).map((row) => row.code).sort();

    const pageAna = await get(app, '/meus-ingressos', ana.cookie);
    const pageBia = await get(app, '/meus-ingressos', bia.cookie);
    expect(ticketRows(pageAna.body).map((row) => row.code).sort()).toEqual(codes(ana.userId));
    expect(ticketRows(pageBia.body).map((row) => row.code).sort()).toEqual(codes(bia.userId));
    for (const code of codes(bia.userId)) expect(pageAna.body).not.toContain(code);
    for (const code of codes(ana.userId)) expect(pageBia.body).not.toContain(code);
  });
});
