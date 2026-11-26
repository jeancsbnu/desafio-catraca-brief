// Regra do check-in (spec 5.2–5.4): leitura e normalização do código digitado, a decisão na ordem
// de R10 (função pura) e a operação atômica — linha do evento travada (a mesma trava da compra, da
// edição e do cancelamento) e a marcação só pela escrita condicional da F05 (markTicketCheckedIn).
import type { Db } from '../../db/pool.js';
import { withTransaction } from '../../db/transaction.js';
import { lockEventForUpdate, type EventRecord } from '../eventos/public.js';
import { findTicketByCode, markTicketCheckedIn, type TicketRecord } from '../ingressos/public.js';
import { CHECKIN_MESSAGES } from './messages.js';
import type { CheckInDecision, CheckInOutcome, CheckInResult } from './types.js';

/** Espera máxima pela trava da linha do evento (depois disso, 500 com ROLLBACK). */
export const CHECKIN_LOCK_TIMEOUT = '5s';

/** Formato de código depois do trim: 8 letras ou dígitos ASCII, em qualquer caixa. */
const TYPED_CODE = /^[A-Za-z0-9]{8}$/;

/** Valor do campo codigo do formulário; ausente, repetido, não-texto ou corpo vazio → ''. */
export function readTypedCode(body: unknown): string {
  if (typeof body !== 'object' || body === null || !Object.hasOwn(body, 'codigo')) return '';
  const value = (body as Record<string, unknown>).codigo;
  return typeof value === 'string' ? value : '';
}

/** " k7q2m9xa " → "K7Q2M9XA"; texto sem formato de código (depois do trim) → null. */
export function normalizeTypedCode(text: string): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return TYPED_CODE.test(trimmed) ? trimmed.toUpperCase() : null;
}

/** A primeira situação verdadeira de R10, na ordem do brief. */
export function decideCheckIn(
  event: Pick<EventRecord, 'id' | 'status'>,
  ticket: Pick<TicketRecord, 'eventId' | 'status' | 'checkedIn'> | null,
): CheckInDecision {
  // 1. O código não existe ou é de outro evento.
  if (ticket === null || ticket.eventId !== event.id) return 'invalido';
  // 2. O evento está cancelado.
  if (event.status === 'cancelado') return 'evento_cancelado';
  // 3. O ingresso não está confirmado.
  if (ticket.status !== 'confirmed') return 'nao_confirmado';
  // 4. O ingresso já passou pelo check-in.
  if (ticket.checkedIn) return 'ja_utilizado';
  // 5. Nenhuma das anteriores.
  return 'liberada';
}

function outcome(
  result: CheckInResult,
  code: string | null,
  ticket: TicketRecord | null,
  event: EventRecord | null,
): CheckInOutcome {
  const own = ticket !== null && event !== null && ticket.eventId === event.id ? ticket : null;
  return { result, message: CHECKIN_MESSAGES[result], code, ticket: own, event };
}

/**
 * Check-in do código digitado no evento (já conferido como do organizador pela rota). Código em
 * branco: nenhuma consulta. Senão, numa transação READ COMMITTED: trava a linha do evento, busca o
 * ingresso pelo código, decide pela ordem de R10 e só em "Entrada liberada" grava a marcação.
 */
export async function checkInTicket(db: Db, eventId: string, typedCode: string): Promise<CheckInOutcome> {
  if (typeof typedCode !== 'string' || typedCode.trim() === '') return outcome('codigo_vazio', null, null, null);
  const code = normalizeTypedCode(typedCode);

  return withTransaction(
    db,
    async (client) => {
      await client.query(`SET LOCAL lock_timeout = '${CHECKIN_LOCK_TIMEOUT}'`);
      // Espera compras, edições, cancelamentos e outros check-ins do mesmo evento; lê a versão mais recente.
      const event = await lockEventForUpdate(client, eventId);
      if (event === null) throw new Error('checkin: evento não encontrado sob a trava');

      const ticket = code === null ? null : await findTicketByCode(client, code);
      const decision = decideCheckIn(event, ticket);
      if (decision !== 'liberada' || ticket === null) return outcome(decision, code, ticket, event);

      // Escrita condicional da F05: WHERE status = 'confirmed' AND NOT checked_in.
      const write = await markTicketCheckedIn(client, ticket.id);
      if (write.updated) return outcome('liberada', code, write.ticket, event);

      // Inalcançável com a trava do evento (defesa): decide de novo com o ingresso atual.
      const again = decideCheckIn(event, write.ticket);
      if (again === 'liberada') throw new Error('checkin: marcação não aplicada');
      return outcome(again, code, write.ticket, event);
    },
    { isolation: 'read committed' },
  );
}
