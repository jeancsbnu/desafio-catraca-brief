// Leitura do campo codigo e normalização do código digitado (spec 5.2).
import { describe, expect, it } from 'vitest';
import { normalizeTypedCode, readTypedCode } from '../../src/features/checkin/public.js';

describe('F08 normalização do código', () => {
  it('F08-CA07 código com espaços nas pontas e minúsculas é normalizado', () => {
    expect(normalizeTypedCode(' k7q2m9xa ')).toBe('K7Q2M9XA');
    expect(normalizeTypedCode('k7Q2m9Xa')).toBe('K7Q2M9XA');
    expect(normalizeTypedCode('\tK7Q2M9XA\n')).toBe('K7Q2M9XA');
    expect(normalizeTypedCode('K7Q2M9XA')).toBe('K7Q2M9XA');
    expect(normalizeTypedCode('   12345678  ')).toBe('12345678');
  });

  it('formato diferente de 8 letras ou dígitos ASCII não é código', () => {
    for (const text of ['K7Q2M9X', 'K7Q2M9XAB', 'K7Q2-M9X', 'K7Q2 M9X', 'ÁBCDEFGH', 'ıııııııı', 'ﬀﬀﬀﬀ', '', '        ']) {
      expect(normalizeTypedCode(text), JSON.stringify(text)).toBeNull();
    }
  });

  it('readTypedCode lê o campo codigo e trata ausente, repetido ou não-texto como vazio', () => {
    expect(readTypedCode({ codigo: 'X' })).toBe('X');
    expect(readTypedCode({ codigo: ' k7q2m9xa ' })).toBe(' k7q2m9xa ');
    for (const body of [{}, { codigo: ['a', 'b'] }, { codigo: 1 }, { codigo: null }, { outro: 'K7Q2M9XA' }, undefined, null, 'codigo=X']) {
      expect(readTypedCode(body), JSON.stringify(body)).toBe('');
    }
    // Só o próprio campo conta (nada herdado do protótipo).
    expect(readTypedCode(Object.create({ codigo: 'K7Q2M9XA' }) as unknown)).toBe('');
  });
});
