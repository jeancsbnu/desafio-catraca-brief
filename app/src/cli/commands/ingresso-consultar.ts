// catraca ingresso:consultar <id do ingresso (tkt_…) ou código> — mostra o ingresso, a tentativa de
// pagamento (sem revelar o resultado antes da entrega) e as vagas do evento.
import { toIsoWithOffset } from '../../core/format.js';
import {
  findTicketByCode,
  findTicketById,
  getSeatAvailability,
  normalizeTicketCode,
  TICKET_STATUS_LABELS,
  type TicketRecord,
} from '../../features/ingressos/public.js';
import type { Queryable } from '../../db/pool.js';
import type { CliContext } from '../index.js';

export const name = 'ingresso:consultar';
export const description = 'Mostra um ingresso por id (tkt_…) ou código';

const USO = 'Uso: catraca ingresso:consultar <id do ingresso (tkt_…) ou código>';

interface AttemptRow {
  id: string;
  card_last4: string;
  result: string;
  delivered_at: Date | null;
  /** delivered_at − requested_at com uma casa ("3.4"); null enquanto pendente. */
  seconds: string | null;
}

async function paymentLine(db: Queryable, ticket: TicketRecord): Promise<string> {
  const { rows } = await db.query<AttemptRow>(
    `SELECT id, card_last4, result, delivered_at,
            CASE WHEN delivered_at IS NULL THEN NULL
                 ELSE round(round(EXTRACT(EPOCH FROM delivered_at - requested_at), 3), 1)::text END AS seconds
       FROM payment_attempts WHERE origin = 'compra' AND reference = $1`,
    [ticket.id],
  );
  const attempt = rows[0];
  if (attempt === undefined) return 'nenhum';
  if (attempt.delivered_at === null || attempt.seconds === null) {
    return `${attempt.id} (cartão final ${attempt.card_last4}, aguardando o gateway)`;
  }
  return (
    `${attempt.id} (cartão final ${attempt.card_last4}, ${attempt.result}, ` +
    `entregue ${attempt.seconds.replace('.', ',')} s após a solicitação)`
  );
}

export async function run({ args, db, print, printError }: CliContext): Promise<number> {
  const [arg] = args;
  if (arg === undefined || args.length !== 1) {
    printError(USO);
    return 2;
  }
  const value = arg.trim();
  const byId = value.startsWith('tkt_');
  const shown = byId ? value : normalizeTicketCode(value);
  const ticket = byId ? await findTicketById(db, value) : await findTicketByCode(db, value);
  if (ticket === null) {
    printError(`Ingresso não encontrado: ${shown}`);
    return 1;
  }

  const seats = await getSeatAvailability(db, ticket.eventId);
  const payment = await paymentLine(db, ticket);
  print(`ingresso: ${ticket.id}`);
  print(`código: ${ticket.code}`);
  print(`evento: ${ticket.eventId} (${seats?.eventStatus ?? 'não encontrado'})`);
  print(`status: ${ticket.status} (${TICKET_STATUS_LABELS[ticket.status]})`);
  print(`check-in: ${ticket.checkedIn && ticket.checkedInAt !== null ? `sim em ${toIsoWithOffset(ticket.checkedInAt)}` : 'não'}`);
  print(`valor pago: ${ticket.pricePaidCents} centavos`);
  print(`canal: ${ticket.channel}`);
  print(`comprador: ${ticket.buyerEmail}`);
  print(`conta: ${ticket.buyerUserId ?? '-'}`);
  print(`criado em: ${toIsoWithOffset(ticket.createdAt)}`);
  print(`status desde: ${toIsoWithOffset(ticket.statusChangedAt)}`);
  print(`pagamento: ${payment}`);
  print(
    seats === null
      ? 'vagas do evento: evento não encontrado'
      : `vagas do evento: lotação ${seats.capacity}, ocupadas ${seats.occupied}, disponíveis ${seats.available}`,
  );
  return 0;
}
