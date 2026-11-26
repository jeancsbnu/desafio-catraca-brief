// Utilitários dos testes da F02 (formulários e cabeçalhos Set-Cookie).
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

export const CREATE_COOKIE =
  /^catraca_sessao=[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}; Max-Age=43200; Path=\/; HttpOnly; SameSite=Lax$/;
export const CLEAR_COOKIE = 'catraca_sessao=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax';

/** POST application/x-www-form-urlencoded (URLSearchParams para campos repetidos). */
export function postForm(
  app: FastifyInstance,
  url: string,
  fields: Readonly<Record<string, string>> | URLSearchParams,
  headers: Readonly<Record<string, string>> = {},
): Promise<LightMyRequestResponse> {
  const params = fields instanceof URLSearchParams ? fields : new URLSearchParams(fields);
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    payload: params.toString(),
  });
}

export function setCookies(response: LightMyRequestResponse): string[] {
  const header = response.headers['set-cookie'];
  if (header === undefined) return [];
  return Array.isArray(header) ? header : [header];
}

/** "catraca_sessao=<valor>" do Set-Cookie de criação da resposta (para o cabeçalho Cookie). */
export function sessionCookieOf(response: LightMyRequestResponse): string {
  const created = setCookies(response).find((cookie) => CREATE_COOKIE.test(cookie));
  if (created === undefined) throw new Error('a resposta não criou sessão');
  return created.split(';')[0] ?? '';
}
