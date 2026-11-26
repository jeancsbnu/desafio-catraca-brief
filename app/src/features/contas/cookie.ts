// Cookie de sessão: token aleatório assinado com HMAC-SHA256 (SESSION_SECRET).
// Valor: <token 43 base64url>.<assinatura 43 base64url>.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'catraca_sessao';
/** 12 horas. */
export const SESSION_MAX_AGE_SECONDS = 43200;

const TOKEN_BYTES = 32;
const SIGNED_VALUE_PATTERN = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;
const COOKIE_ATTRIBUTES = 'Path=/; HttpOnly; SameSite=Lax';

/** Token novo: 32 bytes aleatórios em base64url sem padding (43 caracteres). */
export function newSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

function signatureOf(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token, 'utf8').digest('base64url');
}

/** Valor do cookie: token + "." + HMAC-SHA256(secret, token). */
export function signToken(token: string, secret: string): string {
  return `${token}.${signatureOf(token, secret)}`;
}

/** O valor tem o formato do cookie (sem conferir a assinatura)? */
export function hasSignedValueFormat(value: string): boolean {
  return SIGNED_VALUE_PATTERN.test(value);
}

/** Devolve o token se o formato e a assinatura conferem; senão null (nunca lança). */
export function verifySignedValue(value: string, secret: string): string | null {
  const match = SIGNED_VALUE_PATTERN.exec(value);
  if (!match) return null;
  const token = match[1] ?? '';
  const given = Buffer.from(match[2] ?? '', 'utf8');
  const expected = Buffer.from(signatureOf(token, secret), 'utf8');
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? token : null;
}

/**
 * Valor de um cookie no cabeçalho Cookie: separa por ";", nome antes do primeiro "=", espaços das
 * pontas removidos e aspas duplas envolventes removidas. Havendo repetição, vale o primeiro.
 */
export function readCookie(header: string | readonly string[] | undefined, name: string): string | null {
  if (header === undefined) return null;
  const text = typeof header === 'string' ? header : header.join('; ');
  for (const part of text.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    let value = part.slice(index + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return null;
}

/** Set-Cookie de criação da sessão. */
export function sessionCookieHeader(value: string): string {
  return `${SESSION_COOKIE_NAME}=${value}; Max-Age=${SESSION_MAX_AGE_SECONDS}; ${COOKIE_ATTRIBUTES}`;
}

/** Set-Cookie que apaga o cookie de sessão no navegador. */
export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; ${COOKIE_ATTRIBUTES}`;
}
