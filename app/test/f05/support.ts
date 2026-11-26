// Utilitários dos testes da F05: logger que guarda as mensagens, pool próprio pré-aquecido para as
// rajadas (concorrência real: uma conexão por compra), serviço de compra sobre esse pool e contagens.
import { loadConfig } from '../../src/config.js';
import { createPool, type Db, type Queryable } from '../../src/db/pool.js';
import { criarGatewaySimulado } from '../../src/features/gateway/public.js';
import { createTicketService, type TicketLogger, type TicketService } from '../../src/features/ingressos/public.js';
import { testDatabaseUrl } from '../helpers/db.js';

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  msg: string;
  data: Record<string, unknown>;
}

export function captureLog(): { log: TicketLogger; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const push = (level: LogEntry['level']) => (data: object, msg: string) => {
    entries.push({ level, msg, data: { ...data } });
  };
  return { log: { info: push('info'), warn: push('warn'), error: push('error') }, entries };
}

export const silentLog: TicketLogger = { info: () => {}, warn: () => {}, error: () => {} };

/** Pool próprio com `max` conexões, todas abertas antes de devolver (pré-aquecimento). */
export async function warmPool(max: number): Promise<Db> {
  const pool = createPool({ databaseUrl: testDatabaseUrl(), max });
  const clients = await Promise.all(Array.from({ length: max }, () => pool.connect()));
  for (const client of clients) client.release();
  return pool;
}

/** Serviço de compra fora do Fastify (como a CLI), com o gateway simulado real sobre o mesmo pool. */
export function serviceOn(db: Db, log: TicketLogger = silentLog): TicketService {
  const gateway = criarGatewaySimulado({ db, config: loadConfig({ NODE_ENV: 'test' }) });
  return createTicketService({ db, gateway, log });
}

export async function countRows(db: Queryable, table: 'tickets' | 'payment_attempts', eventId?: string): Promise<number> {
  const where = eventId === undefined ? '' : table === 'tickets' ? ' WHERE event_id = $1' : '';
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*) AS n FROM ${table}${where}`,
    where === '' ? [] : [eventId],
  );
  return rows[0]?.n ?? -1;
}

/** pending + confirmed e total de ingressos do evento. */
export async function occupiedAndTotal(db: Queryable, eventId: string): Promise<{ occupied: number; total: number }> {
  const { rows } = await db.query<{ occupied: number; total: number }>(
    `SELECT count(*) FILTER (WHERE status IN ('pending', 'confirmed')) AS occupied, count(*) AS total
       FROM tickets WHERE event_id = $1`,
    [eventId],
  );
  return rows[0] ?? { occupied: -1, total: -1 };
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const CARD_OK = '4000000000000001';
