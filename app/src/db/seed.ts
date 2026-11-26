// Seed idempotente das três contas documentadas no README (upsert por e-mail, sem diferenciar
// maiúsculas). Reescreve nome, papel e hash da senha; nunca muda id nem created_at.
import { newId } from '../core/ids.js';
import { hashPassword } from '../core/password.js';
import type { Db } from './pool.js';
import { withTransaction } from './transaction.js';

export type UserRole = 'organizador' | 'participante';

export interface SeedAccount {
  name: string;
  email: string;
  role: UserRole;
}

/** Senha das três contas da seed (documentada no README, seção Credenciais). */
export const SEED_PASSWORD = 'catraca123';

export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  { name: 'Organizador A', email: 'organizador.a@catraca.test', role: 'organizador' },
  { name: 'Organizador B', email: 'organizador.b@catraca.test', role: 'organizador' },
  { name: 'Participante', email: 'participante@catraca.test', role: 'participante' },
];

export interface SeedReport {
  created: number;
  existing: number;
}

export async function runSeed(db: Db): Promise<SeedReport> {
  // Hash fora da transação: scrypt é lento de propósito.
  const accounts = await Promise.all(
    SEED_ACCOUNTS.map(async (account) => ({ ...account, passwordHash: await hashPassword(SEED_PASSWORD) })),
  );

  return withTransaction(db, async (client) => {
    let created = 0;
    let existing = 0;
    for (const account of accounts) {
      const { rows } = await client.query<{ inserted: boolean }>(
        `INSERT INTO users (id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ((lower(email))) DO UPDATE
           SET name = EXCLUDED.name,
               role = EXCLUDED.role,
               password_hash = EXCLUDED.password_hash
         RETURNING (xmax = 0) AS inserted`,
        [newId('usr'), account.name, account.email, account.passwordHash, account.role],
      );
      if (rows[0]?.inserted) created += 1;
      else existing += 1;
    }
    return { created, existing };
  });
}

export function describeSeedReport(report: SeedReport): string {
  return `seed: contas garantidas ${report.created + report.existing} (criadas ${report.created}, já existiam ${report.existing})`;
}
