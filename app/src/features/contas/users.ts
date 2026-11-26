// SQL de contas: busca para o login e criação de participante (o cadastro nunca cria organizador).
import { newId } from '../../core/ids.js';
import type { Queryable } from '../../db/pool.js';
import type { SessionUser } from './types.js';

export class EmailAlreadyRegisteredError extends Error {
  override name = 'EmailAlreadyRegisteredError';

  constructor() {
    super('E-mail já cadastrado');
  }
}

export interface LoginCandidate {
  user: SessionUser;
  passwordHash: string;
}

/** Conta do e-mail (sem diferenciar maiúsculas) com o hash da senha; null se não existir. */
export async function findUserForLogin(db: Queryable, email: string): Promise<LoginCandidate | null> {
  // O PostgreSQL não aceita o caractere nulo em texto: um e-mail assim não existe.
  if (email.includes('\u0000')) return null;
  const { rows } = await db.query<SessionUser & { password_hash: string }>(
    'SELECT id, name, email, role, password_hash FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    user: { id: row.id, name: row.name, email: row.email, role: row.role },
    passwordHash: row.password_hash,
  };
}

function isEmailUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  return code === '23505' && constraint === 'users_email_lower_key';
}

/** Cria uma conta de participante (papel fixo no SQL). E-mail repetido → EmailAlreadyRegisteredError. */
export async function insertParticipant(
  client: Queryable,
  account: { name: string; email: string; passwordHash: string },
): Promise<SessionUser> {
  try {
    const { rows } = await client.query<SessionUser>(
      `INSERT INTO users (id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'participante')
       RETURNING id, name, email, role`,
      [newId('usr'), account.name, account.email, account.passwordHash],
    );
    const user = rows[0];
    if (!user) throw new Error('INSERT de participante não devolveu a conta');
    return user;
  } catch (error) {
    if (isEmailUniqueViolation(error)) throw new EmailAlreadyRegisteredError();
    throw error;
  }
}
