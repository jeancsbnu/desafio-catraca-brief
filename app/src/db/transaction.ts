// Transações: o caminho para operações que precisam de atomicidade (compra, cancelamento...).
import type { Db, DbClient } from './pool.js';

export type IsolationLevel = 'read committed' | 'repeatable read' | 'serializable';

const ISOLATION_SQL: Readonly<Record<IsolationLevel, string>> = {
  'read committed': 'BEGIN ISOLATION LEVEL READ COMMITTED',
  'repeatable read': 'BEGIN ISOLATION LEVEL REPEATABLE READ',
  serializable: 'BEGIN ISOLATION LEVEL SERIALIZABLE',
};

/** Executa fn(client) numa transação: COMMIT no sucesso; ROLLBACK e relança no erro. */
export async function withTransaction<T>(
  db: Db,
  fn: (client: DbClient) => Promise<T>,
  options: { isolation?: IsolationLevel } = {},
): Promise<T> {
  const client = await db.connect();
  let releaseError: Error | undefined;
  try {
    await client.query(options.isolation ? ISOLATION_SQL[options.isolation] : 'BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Conexão em estado ruim: descarta o cliente em vez de devolvê-lo ao pool.
      releaseError = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}
