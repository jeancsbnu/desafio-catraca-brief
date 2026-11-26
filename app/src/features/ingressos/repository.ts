// SQL da tabela tickets (seção 6 da spec). Só o módulo ingressos escreve nela; as outras features
// leem pelas funções reexportadas em public.ts (ou por SELECT/JOIN).
import type { Queryable } from '../../db/pool.js';
import type { EventTicketSummary, TicketChannel, TicketRecord, TicketStatus } from './types.js';
import { isTicketCode, isTicketId, normalizeTicketCode } from './validation.js';

export const TICKET_COLUMNS =
  'id, event_id, code, status, checked_in, checked_in_at, price_paid_cents, channel, buyer_user_id, buyer_email, created_at, status_changed_at';

export interface TicketRow {
  id: string;
  event_id: string;
  code: string;
  status: TicketStatus;
  checked_in: boolean;
  checked_in_at: Date | null;
  price_paid_cents: number;
  channel: TicketChannel;
  buyer_user_id: string | null;
  buyer_email: string;
  created_at: Date;
  status_changed_at: Date;
}

export function toTicketRecord(row: TicketRow): TicketRecord {
  return {
    id: row.id,
    code: row.code,
    eventId: row.event_id,
    status: row.status,
    checkedIn: row.checked_in,
    checkedInAt: row.checked_in_at,
    pricePaidCents: row.price_paid_cents,
    channel: row.channel,
    buyerUserId: row.buyer_user_id,
    buyerEmail: row.buyer_email,
    createdAt: row.created_at,
    statusChangedAt: row.status_changed_at,
  };
}

async function one(db: Queryable, sql: string, params: readonly unknown[]): Promise<TicketRecord | null> {
  const { rows } = await db.query<TicketRow>(sql, [...params]);
  const row = rows[0];
  return row === undefined ? null : toTicketRecord(row);
}

async function many(db: Queryable, sql: string, params: readonly unknown[]): Promise<TicketRecord[]> {
  const { rows } = await db.query<TicketRow>(sql, [...params]);
  return rows.map(toTicketRecord);
}

export interface NewTicket {
  id: string;
  eventId: string;
  code: string;
  pricePaidCents: number;
  channel: TicketChannel;
  buyerUserId: string | null;
  buyerEmail: string;
}

/**
 * Insere o ingresso pending com created_at = status_changed_at = clock_timestamp() do comando.
 * Devolve null se o código já existe (ON CONFLICT (code) DO NOTHING): quem chama sorteia outro.
 */
export async function insertTicket(db: Queryable, ticket: NewTicket): Promise<TicketRecord | null> {
  return one(
    db,
    `INSERT INTO tickets (id, event_id, code, price_paid_cents, channel, buyer_user_id, buyer_email, created_at, status_changed_at)
     SELECT $1::text, $2::text, $3::text, $4::integer, $5::text, $6::text, $7::text, t.ts, t.ts
       FROM (SELECT clock_timestamp() AS ts) t
     ON CONFLICT (code) DO NOTHING
     RETURNING ${TICKET_COLUMNS}`,
    [
      ticket.id,
      ticket.eventId,
      ticket.code,
      ticket.pricePaidCents,
      ticket.channel,
      ticket.buyerUserId,
      ticket.buyerEmail,
    ],
  );
}

/** null se não existir ou se o id não tiver o formato tkt_… (sem consultar). */
export async function findTicketById(db: Queryable, id: string): Promise<TicketRecord | null> {
  if (!isTicketId(id)) return null;
  return one(db, `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = $1`, [id]);
}

/** Normaliza (trim + maiúsculas); null sem consultar se não for um código; qualquer evento. */
export async function findTicketByCode(db: Queryable, code: string): Promise<TicketRecord | null> {
  if (typeof code !== 'string') return null;
  const normalized = normalizeTicketCode(code);
  if (!isTicketCode(normalized)) return null;
  return one(db, `SELECT ${TICKET_COLUMNS} FROM tickets WHERE code = $1`, [normalized]);
}

/** Ingressos da conta (só os da vitrine), do mais recente para o mais antigo. */
export async function listTicketsByBuyer(db: Queryable, userId: string): Promise<TicketRecord[]> {
  if (typeof userId !== 'string') return [];
  return many(db, `SELECT ${TICKET_COLUMNS} FROM tickets WHERE buyer_user_id = $1 ORDER BY created_at DESC, id DESC`, [userId]);
}

/** Ingressos do evento, de todos os canais, na ordem de criação. */
export async function listTicketsByEvent(db: Queryable, eventId: string): Promise<TicketRecord[]> {
  if (typeof eventId !== 'string') return [];
  return many(db, `SELECT ${TICKET_COLUMNS} FROM tickets WHERE event_id = $1 ORDER BY created_at, id`, [eventId]);
}

interface SummaryRow {
  pending: number;
  confirmed: number;
  declined: number;
  cancelled: number;
  refunded: number;
  confirmed_checked_in: number;
  confirmed_paid_cents: number;
}

/** Uma consulta agregada; evento sem ingressos → tudo 0. */
export async function summarizeEventTickets(db: Queryable, eventId: string): Promise<EventTicketSummary> {
  const { rows } = await db.query<SummaryRow>(
    `SELECT count(*) FILTER (WHERE status = 'pending') AS pending,
            count(*) FILTER (WHERE status = 'confirmed') AS confirmed,
            count(*) FILTER (WHERE status = 'declined') AS declined,
            count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
            count(*) FILTER (WHERE status = 'refunded') AS refunded,
            count(*) FILTER (WHERE status = 'confirmed' AND checked_in) AS confirmed_checked_in,
            coalesce(sum(price_paid_cents) FILTER (WHERE status = 'confirmed'), 0) AS confirmed_paid_cents
       FROM tickets WHERE event_id = $1`,
    [eventId],
  );
  const row = rows[0];
  return {
    pending: Number(row?.pending ?? 0),
    confirmed: Number(row?.confirmed ?? 0),
    declined: Number(row?.declined ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
    refunded: Number(row?.refunded ?? 0),
    confirmedCheckedIn: Number(row?.confirmed_checked_in ?? 0),
    confirmedPaidCents: Number(row?.confirmed_paid_cents ?? 0),
  };
}

export interface PurchaseAccount {
  id: string;
  email: string;
  role: string;
}

export async function findPurchaseAccount(db: Queryable, userId: string): Promise<PurchaseAccount | null> {
  const { rows } = await db.query<PurchaseAccount>('SELECT id, email, role FROM users WHERE id = $1', [userId]);
  return rows[0] ?? null;
}

/** Resultado do gateway: só um ingresso pending muda (R08, R11); null se não mudou nada. */
export async function applyPaymentResultRow(
  db: Queryable,
  ticketId: string,
  status: Extract<TicketStatus, 'confirmed' | 'declined'>,
): Promise<TicketRecord | null> {
  return one(
    db,
    `UPDATE tickets SET status = $2, status_changed_at = clock_timestamp()
      WHERE id = $1 AND status = 'pending'
      RETURNING ${TICKET_COLUMNS}`,
    [ticketId, status],
  );
}

export async function findTicketStatus(db: Queryable, ticketId: string): Promise<TicketStatus | null> {
  const { rows } = await db.query<{ status: TicketStatus }>('SELECT status FROM tickets WHERE id = $1', [ticketId]);
  return rows[0]?.status ?? null;
}

/**
 * Cancelamento do evento (R11), na transação da F04: confirmed → refunded, pending → cancelled,
 * com status_changed_at = now() (o instante da transação, igual ao cancelled_at do evento).
 */
export async function cancelTicketsOfEvent(db: Queryable, eventId: string): Promise<{ refunded: number; cancelled: number }> {
  const { rows } = await db.query<{ status: TicketStatus }>(
    `UPDATE tickets
        SET status = CASE status WHEN 'confirmed' THEN 'refunded' ELSE 'cancelled' END,
            status_changed_at = now()
      WHERE event_id = $1 AND status IN ('pending', 'confirmed')
      RETURNING status`,
    [eventId],
  );
  return {
    refunded: rows.filter((row) => row.status === 'refunded').length,
    cancelled: rows.filter((row) => row.status === 'cancelled').length,
  };
}

/** Check-in atômico: só um confirmed ainda não usado (null se nada mudou). */
export async function markCheckedInRow(db: Queryable, ticketId: string): Promise<TicketRecord | null> {
  return one(
    db,
    `UPDATE tickets SET checked_in = true, checked_in_at = clock_timestamp()
      WHERE id = $1 AND status = 'confirmed' AND NOT checked_in
      RETURNING ${TICKET_COLUMNS}`,
    [ticketId],
  );
}
