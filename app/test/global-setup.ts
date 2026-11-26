// Executado uma vez antes de todos os testes: recusa banco que não é de teste e aplica as migrations.
import { createPool, waitForDatabase } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { testDatabaseUrl } from './helpers/db.js';

export default async function setup(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(`Os testes só rodam com NODE_ENV=test (atual: ${process.env.NODE_ENV ?? '(não definido)'})`);
  }
  const db = createPool({ databaseUrl: testDatabaseUrl() });
  try {
    await waitForDatabase(db, { timeoutMs: 30_000 });
    await runMigrations(db);
  } finally {
    await db.end();
  }
}
