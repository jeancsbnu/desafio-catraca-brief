// Pool de conexões do PostgreSQL, com o fuso do produto em cada conexão.
import pg from 'pg';
import { PRODUCT_TIMEZONE } from '../core/format.js';
import { errorMessage } from '../core/boot-log.js';

// int8 (bigint, count(*)) chega como number: contagens e centavos cabem com folga em 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => Number.parseInt(value, 10));

export type Db = pg.Pool;
export type DbClient = pg.PoolClient;
/** Qualquer coisa que executa SQL: o pool ou um cliente dentro de uma transação. */
export type Queryable = pg.Pool | pg.PoolClient;

/** max: conexões no máximo (padrão 10); a rajada de compras da CLI e dos testes usa mais (F05). */
export function createPool(config: { databaseUrl: string; max?: number }): Db {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.max ?? 10,
    connectionTimeoutMillis: 5000,
    application_name: 'catraca',
    options: `-c TimeZone=${PRODUCT_TIMEZONE}`,
  });
  // Erro num cliente ocioso (ex.: banco reiniciado) não pode derrubar o processo.
  pool.on('error', (error) => {
    process.stderr.write(`[catraca] erro numa conexão ociosa com o banco: ${errorMessage(error)}\n`);
  });
  return pool;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Tenta SELECT 1 a cada intervalo até o limite; lança o último erro se o banco não responder. */
export async function waitForDatabase(
  db: Db,
  options: { timeoutMs: number; intervalMs?: number },
): Promise<void> {
  const intervalMs = options.intervalMs ?? 1000;
  const deadline = Date.now() + options.timeoutMs;
  for (;;) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (error) {
      if (Date.now() + intervalMs > deadline) {
        throw new Error(`banco de dados não respondeu em ${Math.round(options.timeoutMs / 1000)} s: ${errorMessage(error)}`);
      }
      await sleep(intervalMs);
    }
  }
}
