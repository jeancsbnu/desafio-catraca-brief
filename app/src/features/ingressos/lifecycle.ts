// Ciclo do ingresso depois da compra: resultado do gateway (5.4), cancelamento do evento (5.5) e
// check-in atômico para a F08 (5.7). O ingresso só sai de pending uma vez; cancelled, refunded e
// declined são terminais (o gatilho tickets_guard_update garante o mesmo no banco).
import type { Queryable } from '../../db/pool.js';
import type { EventCancelledHandler } from '../eventos/public.js';
import type { TratadorResultado } from '../gateway/public.js';
import {
  applyPaymentResultRow,
  cancelTicketsOfEvent,
  findTicketById,
  findTicketStatus,
  markCheckedInRow,
} from './repository.js';
import type { CheckInWrite, TicketLogger } from './types.js';
import { isTicketId } from './validation.js';

/**
 * Tratador do resultado do gateway (registrado em app.gateway.aoReceberResultado). Roda na
 * transação de entrega da F03, uma vez por tentativa: aprovado → confirmed, recusado → declined,
 * só se o ingresso ainda estiver pending. Resposta tardia (ingresso já cancelado, por exemplo) é
 * ignorada e registrada em log; nada é relançado. Idempotente.
 */
export function handlePaymentResult(log: TicketLogger): TratadorResultado {
  return async (entrega, transacao) => {
    const status = entrega.resultado === 'aprovado' ? 'confirmed' : 'declined';
    const updated = await applyPaymentResultRow(transacao, entrega.referencia, status);
    if (updated !== null) {
      log.info(
        { ticketId: updated.id, resultado: entrega.resultado, status: updated.status },
        'ingressos: resultado do gateway aplicado',
      );
      return;
    }
    const current = await findTicketStatus(transacao, entrega.referencia);
    if (current === null) {
      log.warn({ referencia: entrega.referencia, resultado: entrega.resultado }, 'ingressos: resultado do gateway sem ingresso');
      return;
    }
    log.info(
      { ticketId: entrega.referencia, resultado: entrega.resultado, statusAtual: current },
      'ingressos: resultado do gateway ignorado',
    );
  };
}

/**
 * Tratador de "evento cancelado" (registrado em app.events.onEventCancelled). Roda na transação do
 * cancelamento da F04, com a linha do evento travada: confirmed → refunded, pending → cancelled,
 * com status_changed_at = cancelled_at do evento. Erro aqui desfaz o cancelamento inteiro.
 */
export function handleEventCancelled(log: TicketLogger): EventCancelledHandler {
  return async (event, client) => {
    const counts = await cancelTicketsOfEvent(client, event.id);
    log.info({ eventId: event.id, ...counts }, 'ingressos: ingressos do evento cancelado atualizados');
  };
}

/**
 * Check-in atômico (a única escrita de check-in permitida): marca só um ingresso confirmed ainda
 * não usado. Sem mudança, devolve o estado atual (lido no mesmo db/transação) para a F08 escolher a
 * mensagem de R10. Dois check-ins simultâneos do mesmo ingresso: só um atualiza.
 */
export async function markTicketCheckedIn(db: Queryable, ticketId: string): Promise<CheckInWrite> {
  if (!isTicketId(ticketId)) return { updated: false, ticket: null };
  const ticket = await markCheckedInRow(db, ticketId);
  if (ticket !== null) return { updated: true, ticket };
  return { updated: false, ticket: await findTicketById(db, ticketId) };
}
