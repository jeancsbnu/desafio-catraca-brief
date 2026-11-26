// Ingressos de teste para qualquer feature (F06–F09): insere direto na tabela tickets, em qualquer
// status (sem gateway e sem trava), e resolve agora os pagamentos pendentes pelo gateway da aplicação.
import type { FastifyInstance } from 'fastify';
import { newId, randomToken } from '../../src/core/ids.js';
import type { Queryable } from '../../src/db/pool.js';
import { generateTicketCode } from '../../src/features/ingressos/code.js';
import type { TicketChannel, TicketRecord, TicketStatus } from '../../src/features/ingressos/public.js';
import { TICKET_COLUMNS, toTicketRecord, type TicketRow } from '../../src/features/ingressos/repository.js';
import { entregarVencidas, vencerTentativas } from './gateway.js';

export interface TestTicketData {
  eventId: string;
  /** Padrão: pending. */
  status?: TicketStatus;
  /** Padrão: vitrine se buyerUserId vier; senão api. */
  channel?: TicketChannel;
  buyerUserId?: string;
  /** Padrão: o e-mail da conta (vitrine) ou teste-<aleatório>@example.com. Gravado em minúsculas. */
  buyerEmail?: string;
  /** Padrão: 10000 (R$ 100,00). */
  pricePaidCents?: number;
  /** Padrão: gerado (8 caracteres A-Z0-9). */
  code?: string;
  /** Padrão: false. true exige status confirmed ou refunded e grava checked_in_at. */
  checkedIn?: boolean;
  /** Padrão: agora (clock_timestamp()); status_changed_at recebe o mesmo instante. */
  createdAt?: Date;
}

export async function insertTestTicket(db: Queryable, data: TestTicketData): Promise<TicketRecord> {
  const buyerUserId = data.buyerUserId ?? null;
  let buyerEmail = data.buyerEmail;
  if (buyerEmail === undefined && buyerUserId !== null) {
    const { rows } = await db.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [buyerUserId]);
    buyerEmail = rows[0]?.email;
  }
  buyerEmail ??= `teste-${randomToken(8)}@example.com`;
  const checkedIn = data.checkedIn ?? false;
  const { rows } = await db.query<TicketRow>(
    `INSERT INTO tickets (id, event_id, code, status, checked_in, checked_in_at, price_paid_cents, channel,
                          buyer_user_id, buyer_email, created_at, status_changed_at)
     SELECT $1::text, $2::text, $3::text, $4::text, $5::boolean, CASE WHEN $5::boolean THEN t.ts END, $6::integer,
            $7::text, $8::text, $9::text, t.ts, t.ts
       FROM (SELECT coalesce($10::timestamptz, clock_timestamp()) AS ts) t
     RETURNING ${TICKET_COLUMNS}`,
    [
      newId('tkt'),
      data.eventId,
      data.code ?? generateTicketCode(),
      data.status ?? 'pending',
      checkedIn,
      data.pricePaidCents ?? 10000,
      data.channel ?? (buyerUserId === null ? 'api' : 'vitrine'),
      buyerUserId,
      buyerEmail.trim().toLowerCase(),
      data.createdAt ?? null,
    ],
  );
  const row = rows[0];
  if (row === undefined) throw new Error('insertTestTicket: INSERT não devolveu a linha');
  return toTicketRecord(row);
}

/**
 * Entrega agora os resultados pendentes do gateway (todos ou só os dos ingressos dados): vence as
 * tentativas e roda uma varredura do gateway da aplicação. Devolve quantas tentativas foram vencidas.
 */
export async function settlePayments(app: FastifyInstance, options: { ticketIds?: readonly string[] } = {}): Promise<number> {
  const vencidas = await vencerTentativas(app.db, { referencias: options.ticketIds });
  await entregarVencidas(app);
  return vencidas;
}
