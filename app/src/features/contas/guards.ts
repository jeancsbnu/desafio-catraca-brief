// Hooks globais do módulo contas (sessão, área do organizador, origem, cache) e guardas exportados.
import type { FastifyReply, FastifyRequest, onSendHookHandler } from 'fastify';
import { isApiPath } from '../../core/errors.js';
import {
  SESSION_COOKIE_NAME,
  clearSessionCookieHeader,
  hasSignedValueFormat,
  readCookie,
  verifySignedValue,
} from './cookie.js';
import { findSessionUser } from './sessions.js';
import type { SessionUser } from './types.js';

/** Token (sem assinatura) da sessão válida carregada em cada requisição. */
const activeTokens = new WeakMap<FastifyRequest, string>();

function pathOf(url: string): string {
  return url.split('?')[0] ?? url;
}

/** Caminhos que nunca usam sessão: API de parceiros e healthcheck. */
function skipsSession(request: FastifyRequest): boolean {
  return isApiPath(request.url) || pathOf(request.url) === '/health';
}

/** Token da sessão válida da requisição (carregada pelo hook loadSession), se houver. */
export function sessionTokenOf(request: FastifyRequest): string | undefined {
  return activeTokens.get(request);
}

/** Valor bruto do cookie de sessão enviado na requisição (vazio conta como ausente). */
export function sessionCookieValueOf(request: FastifyRequest): string | null {
  const value = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
  return value === null || value === '' ? null : value;
}

/** Define o Set-Cookie da sessão, substituindo outro Set-Cookie de sessão já posto na resposta. */
export function setSessionCookie(reply: FastifyReply, header: string): void {
  const current = reply.getHeader('set-cookie');
  const list = Array.isArray(current) ? current.map(String) : current === undefined ? [] : [String(current)];
  const others = list.filter((cookie) => !cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
  reply.removeHeader('set-cookie');
  reply.header('set-cookie', others.length === 0 ? header : [...others, header]);
}

type SessionLookup =
  | { user: SessionUser; token: string }
  | { user: null; reason: 'formato' | 'assinatura' | 'expirada_ou_inexistente' }
  | null;

/** Confere o cookie (formato, assinatura, sessão no banco); null quando não há cookie. */
async function lookupSession(request: FastifyRequest): Promise<SessionLookup> {
  const value = sessionCookieValueOf(request);
  if (value === null) return null;
  const token = verifySignedValue(value, request.server.config.sessionSecret);
  if (token === null) {
    return { user: null, reason: hasSignedValueFormat(value) ? 'assinatura' : 'formato' };
  }
  const user = await findSessionUser(request.server.db, token);
  if (user === null) return { user: null, reason: 'expirada_ou_inexistente' };
  return { user, token };
}

/**
 * onRequest: carrega request.user a partir do cookie. Cookie inválido, adulterado, expirado ou
 * sem sessão no banco → visitante, com o cookie limpo na resposta. Não atua em /api/ nem /health.
 */
export async function loadSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  request.user = null;
  if (skipsSession(request)) return;
  const found = await lookupSession(request);
  if (found === null) return;
  if (found.user !== null) {
    request.user = found.user;
    activeTokens.set(request, found.token);
    return;
  }
  request.log.debug({ motivo: found.reason }, 'contas: cookie de sessão descartado');
  setSessionCookie(reply, clearSessionCookieHeader());
}

/** onSend: páginas HTML de quem está logado não ficam no cache (o "voltar" não as reexibe após Sair). */
export const noStoreWhenLoggedIn: onSendHookHandler = function noStoreWhenLoggedIn(request, reply, payload, done) {
  if (request.user !== null && !reply.hasHeader('cache-control')) {
    const type = reply.getHeader('content-type');
    if (typeof type === 'string' && type.startsWith('text/html')) {
      reply.header('cache-control', 'no-store');
    }
  }
  done(null, payload);
};
