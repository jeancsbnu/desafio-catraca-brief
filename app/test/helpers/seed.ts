// Contas da seed para os testes de qualquer feature.
import type { Db } from '../../src/db/pool.js';
import { runSeed, type UserRole } from '../../src/db/seed.js';
import { testDb } from './db.js';

export interface SeededAccount {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface SeededAccounts {
  organizadorA: SeededAccount;
  organizadorB: SeededAccount;
  participante: SeededAccount;
}

/** Roda a seed no banco de teste e devolve as 3 contas (senha: SEED_PASSWORD). */
export async function seedAccounts(db: Db = testDb()): Promise<SeededAccounts> {
  await runSeed(db);
  const { rows } = await db.query<SeededAccount>(
    `SELECT id, email, name, role FROM users
     WHERE lower(email) IN ('organizador.a@catraca.test', 'organizador.b@catraca.test', 'participante@catraca.test')`,
  );
  const byEmail = (email: string): SeededAccount => {
    const account = rows.find((row) => row.email.toLowerCase() === email);
    if (!account) throw new Error(`Conta da seed não encontrada: ${email}`);
    return account;
  };
  return {
    organizadorA: byEmail('organizador.a@catraca.test'),
    organizadorB: byEmail('organizador.b@catraca.test'),
    participante: byEmail('participante@catraca.test'),
  };
}
