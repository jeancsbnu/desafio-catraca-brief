// Rotas de conta: GET/POST /cadastro, GET/POST /entrar e POST /sair.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hashPassword, verifyPassword } from '../../core/password.js';
import { withTransaction } from '../../db/transaction.js';
import { clearSessionCookieHeader, sessionCookieHeader, signToken, verifySignedValue } from './cookie.js';
import { sessionCookieValueOf, sessionTokenOf, setSessionCookie } from './guards.js';
import { loginContent, signupContent } from './pages.js';
import { safeReturnPath } from './return-path.js';
import { createSession, deleteExpiredSessions, deleteSession } from './sessions.js';
import type { SessionUser } from './types.js';
import { EmailAlreadyRegisteredError, findUserForLogin, insertParticipant } from './users.js';
import { MESSAGES, readLoginForm, validateSignup, type SignupInput } from './validation.js';

export interface AccountRoutesOptions {
  /** Hash de um texto aleatório: o login com e-mail inexistente confere a senha contra ele. */
  dummyPasswordHash: string;
}

function queryField(request: FastifyRequest, name: string): unknown {
  const query = request.query;
  if (typeof query !== 'object' || query === null) return undefined;
  return (query as Record<string, unknown>)[name];
}

function errorMessages(texts: readonly string[]): { kind: 'error'; text: string }[] {
  return texts.map((text) => ({ kind: 'error', text }));
}

export function registerAccountRoutes(app: FastifyInstance, options: AccountRoutesOptions): void {
  /** Encerra a sessão com que a requisição chegou (novo login ou cadastro a substitui). */
  async function endCurrentSession(request: FastifyRequest): Promise<void> {
    const token = sessionTokenOf(request);
    if (token !== undefined) await deleteSession(app.db, token);
  }

  /** Abre a sessão: Set-Cookie de criação na resposta. */
  function sendSessionCookie(reply: FastifyReply, token: string): void {
    setSessionCookie(reply, sessionCookieHeader(signToken(token, app.config.sessionSecret)));
  }

  function signupPage(reply: FastifyReply, values: SignupInput, errors: readonly string[]): Promise<FastifyReply> {
    return reply.page({
      title: 'Criar conta',
      status: errors.length > 0 ? 422 : 200,
      messages: errorMessages(errors),
      content: signupContent({ name: values.name, email: values.email }),
    });
  }

  function loginPage(
    reply: FastifyReply,
    values: { email: string; voltar: string | null },
    failed: boolean,
  ): Promise<FastifyReply> {
    return reply.page({
      title: 'Entrar',
      status: failed ? 422 : 200,
      messages: failed ? errorMessages([MESSAGES.loginFailed]) : [],
      content: loginContent(values),
    });
  }

  app.get('/cadastro', async (request, reply) => {
    if (request.user !== null) {
      return reply.redirect(request.user.role === 'organizador' ? '/organizador' : '/');
    }
    return signupPage(reply, { name: '', email: '', password: '' }, []);
  });

  app.post('/cadastro', async (request, reply) => {
    const result = validateSignup(request.body);
    if (!result.ok) return signupPage(reply, result.value, result.errors);

    const { name, email, password } = result.value;
    const passwordHash = await hashPassword(password);
    let created: { user: SessionUser; token: string };
    try {
      created = await withTransaction(app.db, async (client) => {
        const user = await insertParticipant(client, { name, email, passwordHash });
        const token = await createSession(client, user.id);
        return { user, token };
      });
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) {
        return signupPage(reply, result.value, [MESSAGES.emailTaken]);
      }
      throw error;
    }

    await endCurrentSession(request);
    await deleteExpiredSessions(app.db);
    request.log.info({ userId: created.user.id }, 'contas: conta criada');
    sendSessionCookie(reply, created.token);
    return reply.redirect('/');
  });

  app.get('/entrar', async (request, reply) => {
    const voltar = safeReturnPath(queryField(request, 'voltar'));
    if (request.user !== null) {
      return reply.redirect(request.user.role === 'organizador' ? '/organizador' : (voltar ?? '/'));
    }
    return loginPage(reply, { email: '', voltar }, false);
  });

  app.post('/entrar', async (request, reply) => {
    const form = readLoginForm(request.body);
    const voltar = safeReturnPath(form.voltar);

    let user: SessionUser | null = null;
    if (form.email !== '' && form.password !== '') {
      const candidate = await findUserForLogin(app.db, form.email);
      // E-mail inexistente também paga o custo do scrypt: o tempo não revela quais contas existem.
      const matches = await verifyPassword(form.password, candidate?.passwordHash ?? options.dummyPasswordHash);
      if (candidate !== null && matches) user = candidate.user;
    }

    if (user === null) {
      request.log.info('contas: login recusado');
      return loginPage(reply, { email: form.email, voltar }, true);
    }

    await endCurrentSession(request);
    await deleteExpiredSessions(app.db);
    const token = await createSession(app.db, user.id);
    request.log.info({ userId: user.id, role: user.role }, 'contas: sessão criada');
    sendSessionCookie(reply, token);
    return reply.redirect(user.role === 'organizador' ? '/organizador' : (voltar ?? '/'));
  });

  app.post('/sair', async (request, reply) => {
    // Assinatura válida basta: a linha é apagada mesmo que a sessão já tenha expirado.
    const value = sessionCookieValueOf(request);
    const token = value === null ? null : verifySignedValue(value, app.config.sessionSecret);
    if (token !== null) await deleteSession(app.db, token);
    if (request.user !== null) request.log.info({ userId: request.user.id }, 'contas: sessão encerrada');
    else request.log.info('contas: sessão encerrada');
    setSessionCookie(reply, clearSessionCookieHeader());
    return reply.redirect('/');
  });
}
