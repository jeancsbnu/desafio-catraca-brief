// Banco de teste: pool único por arquivo de teste, limpeza entre testes e bancos temporários.
import { randomToken } from '../../src/core/ids.js';
import { createPool, type Db } from '../../src/db/pool.js';

/** Nome do banco de uma URL de conexão. */
export function databaseNameOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

/** URL do banco de teste; recusa qualquer banco que não termine em _test. */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL não definida: os testes rodam pelo npm run gates');
  }
  const name = databaseNameOf(url);
  if (!name.endsWith('_test')) {
    throw new Error(`Os testes só rodam num banco terminado em _test (atual: ${name})`);
  }
  return url;
}

let pool: Db | undefined;

/** Pool do banco de teste (um por arquivo de teste, fechado no afterAll do setup). */
export function testDb(): Db {
  pool ??= createPool({ databaseUrl: testDatabaseUrl() });
  return pool;
}

export async function closeTestDb(): Promise<void> {
  const current = pool;
  pool = undefined;
  await current?.end();
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Esvazia todas as tabelas de public, exceto schema_migrations. */
export async function resetDatabase(db: Db = testDb()): Promise<void> {
  const { rows } = await db.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'",
  );
  if (rows.length === 0) return;
  const tables = rows.map((row) => `public.${quoteIdent(row.tablename)}`).join(', ');
  await db.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

/** URL igual à de teste, apontando para outro banco. */
export function withDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

/**
 * Cria um banco vazio catraca_test_tmp_<aleatório>, entrega um pool para ele e o remove ao final
 * (DROP DATABASE ... WITH (FORCE)), mesmo em erro.
 */
export async function withTemporaryDatabase<T>(fn: (db: Db, databaseUrl: string) => Promise<T>): Promise<T> {
  const admin = testDb();
  const name = `catraca_test_tmp_${randomToken(12)}`;
  await admin.query(`CREATE DATABASE ${quoteIdent(name)}`);
  const url = withDatabaseName(testDatabaseUrl(), name);
  const db = createPool({ databaseUrl: url });
  try {
    return await fn(db, url);
  } finally {
    await db.end();
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`);
  }
}
