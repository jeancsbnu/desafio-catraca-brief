// Sessões para os testes de qualquer feature: devolvem o valor do cabeçalho Cookie
// ("catraca_sessao=<valor>") para usar em app.inject({ headers: { cookie } }).
import type { FastifyInstance } from 'fastify';
import { SEED_PASSWORD } from '../../src/db/seed.js';
import { SESSION_COOKIE_NAME, signToken } from '../../src/features/contas/cookie.js';
import { createSession } from '../../src/features/contas/sessions.js';

/** Faz POST /entrar (por inject), exige 302 e devolve o cookie da sessão criada. */
export async function loginAs(app: FastifyInstance, email: string, senha: string = SEED_PASSWORD): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/entrar',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ email, senha }).toString(),
  });
  if (response.statusCode !== 302) {
    throw new Error(`loginAs(${email}): POST /entrar respondeu ${response.statusCode}, esperado 302`);
  }
  const header = response.headers['set-cookie'];
  const cookies = header === undefined ? [] : Array.isArray(header) ? header : [header];
  for (const cookie of cookies) {
    const pair = cookie.split(';')[0] ?? '';
    if (pair.startsWith(`${SESSION_COOKIE_NAME}=`) && pair.length > SESSION_COOKIE_NAME.length + 1) {
      return pair;
    }
  }
  throw new Error(`loginAs(${email}): POST /entrar não criou o cookie ${SESSION_COOKIE_NAME}`);
}

/** Cria a sessão direto no banco (sem passar pelo login) e devolve o cookie assinado. */
export async function sessionCookieFor(app: FastifyInstance, userId: string): Promise<string> {
  const token = await createSession(app.db, userId);
  return `${SESSION_COOKIE_NAME}=${signToken(token, app.config.sessionSecret)}`;
}
