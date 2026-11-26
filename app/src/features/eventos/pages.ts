// HTML do módulo eventos (seções 5.2–5.10): lista, novo evento, página de gestão, confirmação do
// cancelamento e 404. Tudo pelo tagged template html (escapa os valores).
import { formatBRL, formatDateTimeBR } from '../../core/format.js';
import { html, raw, type SafeHtml } from '../../core/html.js';
import { eventManagementPath } from './access.js';
import { formatPriceInput, formatStartsAtInput } from './input.js';
import { EVENT_NOT_FOUND_MESSAGE, MESSAGES } from './messages.js';
import { EVENT_STATUS_LABELS, type EventRecord } from './types.js';
import type { EventForm } from './validation.js';

const BACK_TO_LIST = html`<p><a href="/organizador">Voltar para meus eventos</a></p>`;

/** Fragmentos, um por linha do HTML. */
function lines(parts: readonly SafeHtml[]): SafeHtml {
  return raw(parts.map((part) => part.value).join('\n'));
}

/** Valores guardados no formato do formulário de edição. */
export function formValuesOf(event: EventRecord): EventForm {
  return {
    nome: event.name,
    inicio: formatStartsAtInput(event.startsAt),
    local: event.location,
    lotacao: String(event.capacity),
    preco: formatPriceInput(event.priceCents),
  };
}

export const EMPTY_FORM: Readonly<EventForm> = Object.freeze({ nome: '', inicio: '', local: '', lotacao: '', preco: '' });

/** Campos do formulário (criação e edição), sem atributos de validação do navegador. */
export function eventFormFields(values: EventForm): SafeHtml {
  return html`<label for="nome">Nome</label>
<input id="nome" name="nome" type="text" value="${values.nome}">
<label for="inicio">Data e hora de início</label>
<input id="inicio" name="inicio" type="text" placeholder="DD/MM/AAAA HH:MM" value="${values.inicio}">
<small>Horário de Brasília (America/Sao_Paulo).</small>
<label for="local">Local</label>
<input id="local" name="local" type="text" value="${values.local}">
<label for="lotacao">Lotação</label>
<input id="lotacao" name="lotacao" type="text" inputmode="numeric" value="${values.lotacao}">
<label for="preco">Preço (R$)</label>
<input id="preco" name="preco" type="text" inputmode="decimal" placeholder="100,00" value="${values.preco}">`;
}

/** GET /organizador: eventos do organizador logado (5.3). */
export function organizerHomeContent(events: readonly EventRecord[]): SafeHtml {
  const parts: SafeHtml[] = [
    html`<h1>Área do organizador</h1>`,
    html`<p><a href="/organizador/eventos/novo">Novo evento</a></p>`,
  ];
  if (events.length === 0) {
    parts.push(html`<p>Você ainda não tem eventos.</p>`);
  } else {
    parts.push(html`<table>`, html`<thead><tr><th>Nome</th><th>Data</th><th>Status</th></tr></thead>`, html`<tbody>`);
    for (const event of events) {
      parts.push(
        html`<tr><td><a href="${eventManagementPath(event.id)}">${event.name}</a></td><td>${formatDateTimeBR(event.startsAt)}</td><td>${EVENT_STATUS_LABELS[event.status]}</td></tr>`,
      );
    }
    parts.push(html`</tbody>`, html`</table>`);
  }
  return lines(parts);
}

/** GET /organizador/eventos/novo e o 422 da criação (5.4, 5.5). */
export function newEventContent(values: EventForm): SafeHtml {
  return lines([
    html`<h1>Novo evento</h1>`,
    html`<form method="post" action="/organizador/eventos">`,
    eventFormFields(values),
    html`<button type="submit">Salvar</button>`,
    html`</form>`,
    BACK_TO_LIST,
  ]);
}

export interface RenderedSection {
  name: string;
  html: SafeHtml;
}

/** Página de gestão (5.6): dados, status, ações conforme o status e as seções registradas. */
export function managementContent(
  event: EventRecord,
  options: { formValues: EventForm; sections: readonly RenderedSection[] },
): SafeHtml {
  const parts: SafeHtml[] = [
    html`<h1>${event.name}</h1>`,
    html`<p>Status: <strong data-status="${event.status}">${EVENT_STATUS_LABELS[event.status]}</strong></p>`,
    html`<dl>`,
    html`<dt>Data e hora de início</dt><dd>${formatDateTimeBR(event.startsAt)}</dd>`,
    html`<dt>Local</dt><dd>${event.location}</dd>`,
    html`<dt>Lotação</dt><dd>${String(event.capacity)}</dd>`,
    html`<dt>Preço</dt><dd>${formatBRL(event.priceCents)}</dd>`,
    html`</dl>`,
  ];
  if (event.status !== 'cancelado') {
    parts.push(
      html`<section data-secao="edicao">`,
      html`<h2>Editar evento</h2>`,
      html`<form method="post" action="${eventManagementPath(event.id, 'editar')}">`,
      eventFormFields(options.formValues),
      html`<button type="submit">Salvar alterações</button>`,
      html`</form>`,
      html`</section>`,
    );
  }
  if (event.status === 'rascunho') {
    parts.push(
      html`<form method="post" action="${eventManagementPath(event.id, 'publicar')}"><button type="submit">Publicar</button></form>`,
    );
  }
  if (event.status === 'publicado') {
    parts.push(
      html`<form method="get" action="${eventManagementPath(event.id, 'cancelar')}"><button type="submit">Cancelar evento</button></form>`,
    );
  }
  for (const section of options.sections) {
    parts.push(html`<section class="gestao-secao" data-secao="${section.name}">${section.html}</section>`);
  }
  parts.push(BACK_TO_LIST);
  return lines(parts);
}

/** Confirmação do cancelamento (5.9). */
export function cancelConfirmationContent(event: EventRecord): SafeHtml {
  return lines([
    html`<h1>Cancelar evento</h1>`,
    html`<p>Evento: <strong>${event.name}</strong></p>`,
    html`<p>${MESSAGES.cancelConfirmation}</p>`,
    html`<form method="post" action="${eventManagementPath(event.id, 'cancelar')}"><input type="hidden" name="confirmar" value="sim"><button type="submit">Confirmar cancelamento</button></form>`,
    html`<p><a href="${eventManagementPath(event.id)}">Voltar</a></p>`,
  ]);
}

/** 404 de evento (5.10): idêntico para alheio, inexistente e id inválido; nenhum dado do evento. */
export function notFoundContent(): SafeHtml {
  return lines([html`<h1>${EVENT_NOT_FOUND_MESSAGE}</h1>`, BACK_TO_LIST]);
}
