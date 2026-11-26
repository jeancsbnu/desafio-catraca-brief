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
import { forbiddenContent, originBlockedContent } from './pages.js';
import { loginPath } from './return-path.js';
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

// ---------------------------------------------------------------------------------------------
// Checagem de origem (métodos que alteram dados, fora de /api/)

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** A requisição veio de outro site? Sem Origin e sem Sec-Fetch-Site: cross-site (ex.: curl) → não. */
function isForeignOrigin(request: FastifyRequest): boolean {
  if (request.headers['sec-fetch-site'] === 'cross-site') return true;
  const origin = request.headers.origin;
  if (origin === undefined) return false;

  let originUrl: URL;
  try {
    originUrl = new URL(origin); // "null" e valores inválidos lançam
  } catch {
    return true;
  }
  if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') return true;

  const host = request.headers.host;
  if (host === undefined || host === '') return true;
  let hostUrl: URL;
  try {
    // Mesmo esquema do Origin, para normalizar a porta padrão (http://x:80 ≡ x).
    hostUrl = new URL(`${originUrl.protocol}//${host}`);
  } catch {
    return true;
  }
  if (hostUrl.pathname !== '/' || hostUrl.search !== '' || hostUrl.username !== '') return true;
  return originUrl.host !== hostUrl.host;
}

/**
 * onRequest (1º): POST/PUT/PATCH/DELETE vindos de outra origem recebem 403 "Requisição bloqueada"
 * sem nenhum processamento. Não atua em /api/ (API de parceiros, autenticada por X-Api-Key).
 */
export async function originCheck(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (SAFE_METHODS.has(request.method) || isApiPath(request.url)) return;
  if (!isForeignOrigin(request)) return;
  request.log.warn(
    { origin: request.headers.origin, secFetchSite: request.headers['sec-fetch-site'] },
    'contas: requisição bloqueada por origem',
  );
  // A navegação da página mostra quem está logado; a sessão só é lida, nunca alterada.
  const found = await lookupSession(request);
  request.user = found?.user ?? null;
  await reply.page({ title: 'Requisição bloqueada', status: 403, content: originBlockedContent() });
}

// ---------------------------------------------------------------------------------------------
// Área do organizador e guardas

function isOrganizerPath(path: string): boolean {
  return path === '/organizador' || path.startsWith('/organizador/');
}

/**
 * A requisição é da área do organizador? Caminho (sem query, decodificado) igual a /organizador ou
 * abaixo dele, ou rota casada com esse padrão. Vale também para caminhos sem rota (404).
 */
export function isOrganizerAreaRequest(request: FastifyRequest): boolean {
  const rawPath = pathOf(request.url);
  let path = rawPath;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    // Codificação inválida: usa o caminho cru.
  }
  const routeUrl = request.routeOptions.url;
  return isOrganizerPath(path) || isOrganizerPath(rawPath) || (routeUrl !== undefined && isOrganizerPath(routeUrl));
}

async function sendForbidden(reply: FastifyReply, area: 'organizador' | 'participante'): Promise<void> {
  await reply.page({ title: 'Acesso negado', status: 403, content: forbiddenContent(area) });
}

/** Exige organizador: visitante → 302 /entrar; participante → 403 Acesso negado. */
export async function requireOrganizer(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.user === null) {
    await reply.redirect('/entrar');
    return;
  }
  if (request.user.role !== 'organizador') {
    await sendForbidden(reply, 'organizador');
  }
}

/** onRequest (3º): toda a área do organizador (inclusive rotas futuras) exige organizador. */
export async function organizerArea(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!isOrganizerAreaRequest(request)) return;
  await requireOrganizer(request, reply);
}

export interface RequireParticipantOptions {
  /** Página para onde o visitante volta depois do login (padrão: a própria URL em GET/HEAD). */
  returnTo?: (request: FastifyRequest) => string;
  /** Deixa o organizador seguir para o handler decidir (padrão: 403 Acesso negado). */
  allowOrganizer?: boolean;
}

/**
 * Exige participante: visitante → 302 /entrar?voltar=<origem>; organizador → 403 Acesso negado,
 * ou segue com allowOrganizer.
 */
export function requireParticipant(
  options: RequireParticipantOptions = {},
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function requireParticipantGuard(request, reply) {
    const user = request.user;
    if (user === null) {
      let destination: string | undefined;
      if (options.returnTo !== undefined) destination = options.returnTo(request);
      else if (request.method === 'GET' || request.method === 'HEAD') destination = request.url;
      await reply.redirect(loginPath(destination));
      return;
    }
    if (user.role === 'organizador' && options.allowOrganizer !== true) {
      await sendForbidden(reply, 'participante');
    }
  };
}

/** Usuário da sessão. Sem sessão é erro de programação (rota sem guarda) → 500. */
export function currentUser(request: FastifyRequest): SessionUser {
  if (request.user === null) {
    throw new Error('currentUser sem sessão: use requireOrganizer ou requireParticipant na rota');
  }
  return request.user;
}

// ---------------------------------------------------------------------------------------------
// Cache

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
