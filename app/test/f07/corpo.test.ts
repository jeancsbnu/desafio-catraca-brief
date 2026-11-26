// Corpo da compra (spec 5.4): Content-Type, JSON, objeto e os dois campos, na ordem do brief.
import { describe, expect, it } from 'vitest';
import { isJsonContentType, parsePurchaseBody, type PurchaseBodyFailure } from '../../src/features/parceiros/body.js';

const J = 'application/json';
const VALID = '{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001"}';
const withCard = (card: string) => `{"buyerEmail":"ana@example.com","cardNumber":${card}}`;
const withEmail = (email: string) => `{"buyerEmail":${email},"cardNumber":"4000000000000001"}`;

describe('F07 corpo da compra', () => {
  it('F07-CA03 isJsonContentType aceita só application/json, com ou sem parâmetros', () => {
    for (const header of ['application/json', 'application/json; charset=utf-8', 'Application/JSON', ' application/json ;charset=UTF-8']) {
      expect(isJsonContentType(header), header).toBe(true);
    }
    for (const header of [undefined, null, '', 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', 'application/vnd.api+json', 'application/jsonx', 'json', ['application/json']]) {
      expect(isJsonContentType(header), String(header)).toBe(false);
    }
  });

  it('F07-CA03 parsePurchaseBody recusa cada forma de corpo inválido com o motivo certo', () => {
    const cases: [contentType: unknown, body: unknown, reason: PurchaseBodyFailure][] = [
      [undefined, VALID, 'content_type'],
      ['text/plain', VALID, 'content_type'],
      ['application/x-www-form-urlencoded', 'buyerEmail=ana%40example.com&cardNumber=4000000000000001', 'content_type'],
      [J, '', 'json'],
      [J, undefined, 'json'],
      [J, '   ', 'json'],
      [J, VALID.slice(0, -1), 'json'],
      [J, 'isto não é json', 'json'],
      [J, String.fromCharCode(0xfeff) + VALID, 'json'],
      [J, 'null', 'objeto'],
      [J, '[]', 'objeto'],
      [J, `[${VALID}]`, 'objeto'],
      [J, '1', 'objeto'],
      [J, '"x"', 'objeto'],
      [J, 'true', 'objeto'],
      [J, '{"cardNumber":"4000000000000001"}', 'buyerEmail'],
      [J, '{}', 'buyerEmail'],
      [J, withEmail('null'), 'buyerEmail'],
      [J, withEmail('123'), 'buyerEmail'],
      [J, withEmail('"nao-e-um-email"'), 'buyerEmail'],
      [J, withEmail(`"${'a'.repeat(243)}@example.com"`), 'buyerEmail'],
      [J, '{"buyerEmail":"ana@example.com"}', 'cardNumber'],
      [J, withCard('4000000000000001'), 'cardNumber'],
      [J, withCard('null'), 'cardNumber'],
      [J, withCard('"123"'), 'cardNumber'],
      [J, withCard('"400000000000001"'), 'cardNumber'],
      [J, withCard('"40000000000000011"'), 'cardNumber'],
      [J, withCard('"400000000000000A"'), 'cardNumber'],
      [J, withCard('"4000 0000 0000 0001"'), 'cardNumber'],
      [J, withCard('"4000-0000-0000-0001"'), 'cardNumber'],
      [J, withCard('" 4000000000000001"'), 'cardNumber'],
    ];
    for (const [contentType, body, reason] of cases) {
      expect(parsePurchaseBody(contentType, body), `${String(contentType)} ${String(body).slice(0, 60)}`).toEqual({ ok: false, reason });
    }
    // A primeira falha decide o motivo: e-mail e cartão inválidos → buyerEmail.
    expect(parsePurchaseBody(J, '{"buyerEmail":"x","cardNumber":"1"}')).toEqual({ ok: false, reason: 'buyerEmail' });
  });

  it('F07-CA02 parsePurchaseBody aceita o corpo do brief e ignora campos extras', () => {
    expect(parsePurchaseBody(J, VALID)).toEqual({ ok: true, buyerEmail: 'ana@example.com', cardNumber: '4000000000000001' });
    expect(parsePurchaseBody('application/json; charset=utf-8', '{ "buyerEmail": "ana@example.com", "cardNumber": "4000000000000001" }')).toEqual({
      ok: true,
      buyerEmail: 'ana@example.com',
      cardNumber: '4000000000000001',
    });
    const extras = '{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001","quantity":3,"eventId":"evt_x","channel":"vitrine","__proto__":{"a":1}}';
    const parsed = parsePurchaseBody(J, extras);
    expect(parsed).toEqual({ ok: true, buyerEmail: 'ana@example.com', cardNumber: '4000000000000001' });
    expect(Object.keys(parsed)).toEqual(['ok', 'buyerEmail', 'cardNumber']);
    // __proto__ do JSON não contamina nada.
    expect(({} as Record<string, unknown>).a).toBeUndefined();
  });
});
