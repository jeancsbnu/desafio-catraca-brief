// SQL de sessões. O token só circula em memória e no cookie; o banco guarda sha256(token) em hex.
import { createHash } from 'node:crypto';
import type { Queryable } from '../../db/pool.js';
import { newSessionToken } from './cookie.js';
import type { SessionUser } from './types.js';

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Cria uma sessão de 12 horas para o usuário e devolve o token (ainda sem assinatura). */
export async function createSession(db: Queryable, userId: string): Promise<string> {
  const token = newSessionToken();
  await db.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '12 hours')",
    [hashSessionToken(token), userId],
  );
  return token;
}

/** Usuário da sessão válida (não expirada) do token; null se não houver. */
export async function findSessionUser(db: Queryable, token: string): Promise<SessionUser | null> {
  const { rows } = await db.query<SessionUser>(
    `SELECT u.id, u.name, u.email, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashSessionToken(token)],
  );
  return rows[0] ?? null;
}

export async function deleteSession(db: Queryable, token: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
}

export async function deleteExpiredSessions(db: Queryable): Promise<void> {
  await db.query('DELETE FROM sessions WHERE expires_at <= now()');
}
