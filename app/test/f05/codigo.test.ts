// Código do ingresso e validações das entradas (spec 5.1, 5.2, 5.8).
import { describe, expect, it } from 'vitest';
import { generateTicketCode, TICKET_CODE_ALPHABET } from '../../src/features/ingressos/code.js';
import {
  isTicketCode,
  isTicketId,
  isValidBuyerEmail,
  isValidCardNumber,
  normalizeBuyerEmail,
  normalizeTicketCode,
} from '../../src/features/ingressos/validation.js';

describe('F05 código do ingresso', () => {
  it('F05-CA06 o código tem 8 caracteres de A-Z0-9 e usa o alfabeto inteiro', () => {
    const total = 20_000;
    const frequency = new Map<string, number>();
    for (let i = 0; i < total; i += 1) {
      const code = generateTicketCode();
      expect(code).toMatch(/^[A-Z0-9]{8}$/);
      for (const symbol of code) frequency.set(symbol, (frequency.get(symbol) ?? 0) + 1);
    }
    expect([...frequency.keys()].sort().join('')).toBe([...TICKET_CODE_ALPHABET].sort().join(''));
    const mean = (total * 8) / 36;
    for (const [symbol, count] of frequency) {
      expect(Math.abs(count - mean) / mean, symbol).toBeLessThanOrEqual(0.15);
    }
  });

  it('ZZZZZZZZ nunca é gerado', () => {
    const z = TICKET_CODE_ALPHABET.indexOf('Z');
    const a = TICKET_CODE_ALPHABET.indexOf('A');
    const calls: number[] = [];
    const random = (size: number): Uint8Array => {
      calls.push(size);
      // 1ª chamada: só Z (com bytes descartados, ≥ 252, no meio); depois: só A.
      return Uint8Array.from({ length: size }, (_, i) => (calls.length === 1 ? (i === 3 ? 255 : z) : a));
    };
    expect(generateTicketCode(random)).toBe('AAAAAAAA');
    expect(calls.length).toBe(2);
  });

  it('normalizeTicketCode e isTicketCode', () => {
    expect(normalizeTicketCode(' k7q2m9xa ')).toBe('K7Q2M9XA');
    expect(isTicketCode('K7Q2M9XA')).toBe(true);
    for (const value of ['K7Q2M9X', 'K7Q2M9XA1', 'k7q2m9xa', ' K7Q2M9XA', 'K7Q2-9XA', 12345678, null]) {
      expect(isTicketCode(value), String(value)).toBe(false);
    }
    expect(isTicketId('tkt_51xqk2m9a0c7d3ef')).toBe(true);
    for (const value of ['tkt_51XQK2M9A0C7D3EF', 'tkt_51xqk2m9a0c7d3e', 'evt_51xqk2m9a0c7d3ef', 1]) {
      expect(isTicketId(value), String(value)).toBe(false);
    }
  });

  it('F05-CA03 isValidCardNumber exige exatamente 16 dígitos', () => {
    expect(isValidCardNumber('4000000000000001')).toBe(true);
    const invalid: unknown[] = [
      '400000000000001',
      '40000000000000011',
      '400000000000000A',
      '4000 0000 0000 0001',
      '4000-0000-0000-0001',
      ' 4000000000000001',
      '4000000000000001 ',
      '',
      4000000000000001,
      null,
      undefined,
      '４０００００００００００００01',
    ];
    for (const value of invalid) {
      expect(isValidCardNumber(value), String(value)).toBe(false);
    }
  });

  it('isValidBuyerEmail segue a regra da F02', () => {
    expect(isValidBuyerEmail('ana@example.com')).toBe(true);
    expect(isValidBuyerEmail(' ana@example.com ')).toBe(true);
    expect(isValidBuyerEmail(`${'a'.repeat(242)}@example.com`)).toBe(true);
    for (const value of ['nao-e-um-email', 'a@b', 'a b@c.d', '', `${'a'.repeat(243)}@example.com`, 'a\u0000@b.c', 42, null]) {
      expect(isValidBuyerEmail(value), String(value)).toBe(false);
    }
    expect(normalizeBuyerEmail(' Ana@Example.com ')).toBe('ana@example.com');
  });
});
