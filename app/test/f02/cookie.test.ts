import { describe, expect, it } from 'vitest';
import {
  clearSessionCookieHeader,
  newSessionToken,
  readCookie,
  sessionCookieHeader,
  signToken,
  verifySignedValue,
} from '../../src/features/contas/cookie.js';

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
const FORMAT = /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/;

describe('F02 cookie de sessão', () => {
  it('assina o token e confere com o mesmo segredo', () => {
    const token = newSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const value = signToken(token, SECRET);
    expect(value).toHaveLength(87);
    expect(value).toMatch(FORMAT);
    expect(verifySignedValue(value, SECRET)).toBe(token);
    expect(newSessionToken()).not.toBe(token);
  });

  it('rejeita assinatura alterada, valor sem assinatura, formato inválido e outro segredo', () => {
    const token = newSessionToken();
    const value = signToken(token, SECRET);
    const signature = value.slice(44);
    const altered = `${token}.${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    expect(verifySignedValue(altered, SECRET)).toBeNull();
    expect(verifySignedValue(token, SECRET)).toBeNull();
    expect(verifySignedValue('qualquer-coisa', SECRET)).toBeNull();
    expect(verifySignedValue(`${value}x`, SECRET)).toBeNull();
    expect(verifySignedValue('', SECRET)).toBeNull();
    expect(verifySignedValue(value, 'outro-segredo-com-mais-de-32-caracteres!!')).toBeNull();
  });

  it('lê o cookie certo entre vários e ignora espaços e aspas', () => {
    expect(readCookie('a=1; catraca_sessao="x.y" ; b=2', 'catraca_sessao')).toBe('x.y');
    expect(readCookie('catraca_sessao=primeiro; catraca_sessao=segundo', 'catraca_sessao')).toBe('primeiro');
    expect(readCookie('xcatraca_sessao=1; outra=2', 'catraca_sessao')).toBeNull();
    expect(readCookie('a=b=c', 'a')).toBe('b=c');
    expect(readCookie(undefined, 'catraca_sessao')).toBeNull();
    expect(readCookie('', 'catraca_sessao')).toBeNull();
  });

  it('cabeçalho de criação tem Max-Age=43200, Path=/, HttpOnly, SameSite=Lax e não tem Secure', () => {
    const header = sessionCookieHeader('abc.def');
    expect(header).toBe('catraca_sessao=abc.def; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax');
    expect(header).not.toContain('Secure');
  });

  it('cabeçalho de limpeza tem valor vazio e Max-Age=0', () => {
    expect(clearSessionCookieHeader()).toBe('catraca_sessao=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
  });
});
