// Utilitários dos testes da F07: aplicação com contas e fábrica de eventos, chamadas cruas à API
// (Content-Type e corpo à escolha), contagens, compra pelo canal vitrine e captura das linhas de log.
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Queryable } from '../../src/db/pool.js';
import type { EventRecord, EventStatus } from '../../src/features/eventos/public.js';
import type { TicketRecord } from '../../src/features/ingressos/public.js';
import { createTestApp, type TestAppOptions } from '../helpers/app.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';

export const KEY = 'parceiro-catraca-dev';
export const JSON_TYPE = 'application/json; charset=utf-8';
export const CARD_OK = '4000000000000001';
export const BRIEF_BODY = '{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001"}';

export const UNAUTHORIZED = '{"error":"unauthorized"}';
export const INVALID_REQUEST = '{"error":"invalid_request"}';
export const EVENT_NOT_AVAILABLE = '{"error":"event_not_available"}';
export const SOLD_OUT = '{"error":"sold_out"}';
export const TICKET_NOT_FOUND = '{"error":"ticket_not_found"}';
export const NOT_FOUND = '{"error":"not_found"}';

export const PURCHASE_ACCEPTED = /^\{"ticketId":"(tkt_[a-z0-9]{16})","code":"([A-Z0-9]{8})","status":"pending"\}$/;

export async function setup(options: TestAppOptions = {}) {
  const test = await createTestApp(options);
  const accounts = await seedAccounts();
  const event = (data: { capacity?: number; priceCents?: number; status?: EventStatus; startsAt?: Date; name?: string } = {}): Promise<EventRecord> =>
    insertTestEvent(test.db, { organizerId: accounts.organizadorA.id, capacity: 5, ...data });
  return { ...test, ...accounts, event };
}

export interface RawPurchase {
  /** Padrão: application/json; null = sem Content-Type. */
  contentType?: string | null;
  /** Padrão: o corpo do brief. */
  payload?: string;
  /** Padrão: a chave da aplicação; null = sem o cabeçalho. */
  key?: string | null;
  headers?: Record<string, string>;
}

/** POST /api/partner/events/{eventId}/purchases cru (o id vai no caminho como veio). */
export function rawPurchase(app: FastifyInstance, eventId: string, options: RawPurchase = {}): Promise<LightMyRequestResponse> {
  const headers: Record<string, string> = { ...options.headers };
  const key = options.key === undefined ? app.config.partnerApiKey : options.key;
  if (key !== null) headers['x-api-key'] = key;
  const contentType = options.contentType === undefined ? 'application/json' : options.contentType;
  if (contentType !== null) headers['content-type'] = contentType;
  return app.inject({
    method: 'POST',
    url: `/api/partner/events/${eventId}/purchases`,
    headers,
    payload: options.payload ?? BRIEF_BODY,
  });
}

/** GET com a chave da aplicação (ou sem chave, com key null). */
export function apiGet(app: FastifyInstance, url: string, key: string | null = app.config.partnerApiKey): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'GET', url, headers: key === null ? {} : { 'x-api-key': key } });
}

export async function countRows(db: Queryable, table: 'tickets' | 'payment_attempts'): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`);
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

/** Compra pelo canal vitrine (conta do participante), pelo serviço da F05. */
export async function buyVitrine(app: FastifyInstance, eventId: string, userId: string, cardNumber = CARD_OK): Promise<TicketRecord> {
  const result = await app.tickets.purchase({ eventId, buyer: { type: 'account', userId }, cardNumber, channel: 'vitrine' });
  if (!result.ok) throw new Error(`compra pela vitrine recusada: ${result.reason}`);
  return result.ticket;
}

/** Compra pela API que precisa dar 202; devolve o id e o código. */
export async function buyApi(app: FastifyInstance, eventId: string, cardNumber = CARD_OK, buyerEmail = 'ana@example.com') {
  const response = await rawPurchase(app, eventId, { payload: JSON.stringify({ buyerEmail, cardNumber }) });
  const match = PURCHASE_ACCEPTED.exec(response.body);
  if (response.statusCode !== 202 || match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`compra pela API: ${response.statusCode} ${response.body}`);
  }
  return { ticketId: match[1], code: match[2] };
}

/** Elemento do evento na listagem da API (undefined se ausente). */
export async function listedEvent(app: FastifyInstance, eventId: string): Promise<Record<string, unknown> | undefined> {
  const response = await apiGet(app, '/api/partner/events');
  if (response.statusCode !== 200) throw new Error(`listagem: ${response.statusCode} ${response.body}`);
  return response.json<Record<string, unknown>[]>().find((item) => item.id === eventId);
}

/**
 * Passa a guardar as linhas de log da aplicação (as que o pino escreveria na saída), em vez de
 * escrevê-las. A aplicação precisa ter sido criada com LOG_LEVEL que inclua as mensagens.
 */
export function captureLogLines(app: FastifyInstance): string[] {
  const lines: string[] = [];
  const logger = app.log as unknown as Record<symbol, unknown>;
  const streamSymbol = Object.getOwnPropertySymbols(logger).find((symbol) => symbol.description === 'pino.stream');
  if (streamSymbol === undefined) throw new Error('captureLogLines: logger sem pino.stream');
  logger[streamSymbol] = {
    write(line: string) {
      lines.push(line);
      return true;
    },
  };
  return lines;
}

export interface LogLine {
  level: number;
  msg: string;
  [field: string]: unknown;
}

export function parseLogLines(lines: readonly string[]): LogLine[] {
  return lines.map((line) => JSON.parse(line) as LogLine);
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
