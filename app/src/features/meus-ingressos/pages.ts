// HTML de "Meus ingressos" (spec 5.5): a tabela dos ingressos da conta ou a mensagem de lista vazia.
// Tudo pelo tagged template html (valores escapados); cada fragmento é uma linha.
import { formatDateTimeBR } from '../../core/format.js';
import { html, raw, type SafeHtml } from '../../core/html.js';
import type { EventRecord } from '../eventos/public.js';
import { TICKET_STATUS_LABELS, type TicketRecord } from '../ingressos/public.js';
import { MY_TICKETS_TITLE, NO_TICKETS_MESSAGE } from './messages.js';

/** Um ingresso da conta e o evento dele (de qualquer status, inclusive cancelado). */
export interface MyTicketRow {
  ticket: TicketRecord;
  event: EventRecord;
}

function lines(parts: readonly SafeHtml[]): SafeHtml {
  return raw(parts.map((part) => part.value).join('\n'));
}

function ticketRow({ ticket, event }: MyTicketRow): SafeHtml {
  return html`<tr><td>${event.name}</td><td>${formatDateTimeBR(event.startsAt)}</td><td data-status="${ticket.status}">${TICKET_STATUS_LABELS[ticket.status]}</td><td><code>${ticket.code}</code></td></tr>`;
}

/** Linhas na ordem dada (do mais recente para o mais antigo). */
export function myTicketsContent(rows: readonly MyTicketRow[]): SafeHtml {
  if (rows.length === 0) {
    return lines([html`<h1>${MY_TICKETS_TITLE}</h1>`, html`<p>${NO_TICKETS_MESSAGE}</p>`]);
  }
  return lines([
    html`<h1>${MY_TICKETS_TITLE}</h1>`,
    html`<table>`,
    html`<thead><tr><th>Evento</th><th>Data do evento</th><th>Status</th><th>Código</th></tr></thead>`,
    html`<tbody>`,
    ...rows.map(ticketRow),
    html`</tbody>`,
    html`</table>`,
  ]);
}
