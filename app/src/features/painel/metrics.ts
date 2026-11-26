// Cálculo do painel (spec 5.3 e 5.4): o evento (F04) e o resumo dos ingressos (F05) lidos num único
// instantâneo do banco, numa transação REPEATABLE READ somente leitura, e os seis números de R12 a
// partir deles. Nenhum SQL próprio sobre tickets: só as funções públicas de F04 e F05.
import type { Db } from '../../db/pool.js';
import { withTransaction } from '../../db/transaction.js';
import { findEventById, type EventRecord } from '../eventos/public.js';
import { computeAvailableSeats, summarizeEventTickets, type EventTicketSummary } from '../ingressos/public.js';
import type { EventPanel } from './types.js';

const INVALID_SUMMARY = 'painel: resumo de ingressos inválido';

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(INVALID_SUMMARY);
  }
  return value;
}

/**
 * Os seis números de R12 (puro). declined e cancelled não entram em nenhum número; Vagas pela
 * regra de R05 da F05 a partir das mesmas contagens exibidas. Resumo impossível → Error (erro de
 * programação, que a seção mostra como painel indisponível).
 */
export function computePanel(event: Pick<EventRecord, 'capacity' | 'status'>, summary: EventTicketSummary): EventPanel {
  const confirmed = count(summary.confirmed);
  const pending = count(summary.pending);
  const checkIns = count(summary.confirmedCheckedIn);
  const refunded = count(summary.refunded);
  const revenueCents = count(summary.confirmedPaidCents);
  if (checkIns > confirmed) throw new Error(INVALID_SUMMARY);
  return {
    confirmed,
    pending,
    checkIns,
    availableSeats: computeAvailableSeats(event, pending + confirmed),
    revenueCents,
    refunded,
  };
}

/**
 * Lê o painel do evento num instantâneo único: em REPEATABLE READ todas as consultas enxergam o
 * banco do instante da primeira; somente leitura, não espera travas de linha nem as segura.
 */
export async function loadEventPanel(db: Db, eventId: string): Promise<EventPanel> {
  return withTransaction(
    db,
    async (client) => {
      await client.query('SET TRANSACTION READ ONLY');
      const event = await findEventById(client, eventId);
      if (event === null) throw new Error('painel: evento não encontrado');
      const summary = await summarizeEventTickets(client, eventId);
      return computePanel(event, summary);
    },
    { isolation: 'repeatable read' },
  );
}
