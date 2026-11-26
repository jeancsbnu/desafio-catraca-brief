// Seção "Check-in" da página de gestão (spec 5.5): o campo Código e o botão Validar, em qualquer
// status do evento; depois de um envio, o resultado em destaque logo acima do campo, que volta vazio
// e com foco. A F04 embrulha o fragmento em <section class="gestao-secao" data-secao="checkin">.
import { html, raw, type SafeHtml } from '../../core/html.js';
import { eventManagementPath, type ManagementSectionContext } from '../eventos/public.js';
import { CHECKIN_MESSAGES, CHECKIN_TEXTS } from './messages.js';
import type { CheckInResult, CheckInSectionState } from './types.js';

export const CHECKIN_SECTION_NAME = 'checkin';
export const CHECKIN_SECTION_ORDER = 100;

/** /organizador/eventos/{id}/checkin */
export function checkInPath(eventId: string): string {
  return eventManagementPath(eventId, 'checkin');
}

function isCheckInResult(value: unknown): value is CheckInResult {
  return typeof value === 'string' && Object.hasOwn(CHECKIN_MESSAGES, value);
}

function isSectionState(value: unknown): value is CheckInSectionState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    isCheckInResult(state.result) &&
    typeof state.message === 'string' &&
    (state.code === null || typeof state.code === 'string')
  );
}

const INPUT = html`<input id="codigo" name="codigo" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" value="">`;
const INPUT_FOCUSED = html`<input id="codigo" name="codigo" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" value="" autofocus>`;

/** Sem resultado quando context.state é undefined (GET da página); com resultado depois de um envio. */
export function renderCheckInSection(context: ManagementSectionContext): SafeHtml {
  const state = isSectionState(context.state) ? context.state : undefined;
  const parts: SafeHtml[] = [html`<h2>${CHECKIN_TEXTS.title}</h2>`];
  if (state !== undefined) {
    const released = state.result === 'liberada';
    parts.push(
      html`<p class="msg ${released ? 'msg-success' : 'msg-error'}" role="${released ? 'status' : 'alert'}" data-checkin-resultado="${state.result}">${state.message}</p>`,
    );
    if (state.code !== null) {
      parts.push(html`<p class="checkin-codigo">${CHECKIN_TEXTS.checkedCodePrefix} <strong>${state.code}</strong></p>`);
    }
  }
  parts.push(
    html`<form method="post" action="${checkInPath(context.event.id)}">`,
    html`<label for="codigo">${CHECKIN_TEXTS.label}</label>`,
    state === undefined ? INPUT : INPUT_FOCUSED,
    html`<button type="submit">${CHECKIN_TEXTS.button}</button>`,
    html`</form>`,
  );
  return raw(parts.map((part) => part.value).join('\n'));
}
