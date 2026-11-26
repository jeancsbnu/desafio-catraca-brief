// HTML da vitrine (spec 5.2–5.4): lista dos eventos à venda, página do evento com o bloco de compra
// e a página 404. Tudo pelo tagged template html (valores escapados); cada fragmento é uma linha.
import { formatBRL, formatDateTimeBR } from '../../core/format.js';
import { html, raw, type SafeHtml } from '../../core/html.js';
import { loginPath } from '../contas/public.js';
import { EVENT_NOT_FOUND_MESSAGE, type EventRecord } from '../eventos/public.js';
import {
  BACK_TO_SHOWCASE_LABEL,
  BUY_LABEL,
  CARD_FIELD_LABEL,
  EMPTY_SHOWCASE_MESSAGE,
  LOGIN_TO_BUY_LABEL,
  ORGANIZER_PURCHASE_MESSAGE,
  SHOWCASE_TITLE,
  SOLD_OUT_MESSAGE,
  eventPagePath,
  purchasePath,
} from './messages.js';
import type { PurchaseBlockKind } from './purchase.js';

/** Uma linha da vitrine: o evento à venda e as vagas disponíveis no instante. */
export interface ShowcaseRow {
  event: EventRecord;
  available: number;
}

const BACK_TO_SHOWCASE = html`<p><a href="/">${BACK_TO_SHOWCASE_LABEL}</a></p>`;

/** Fragmentos, um por linha do HTML. */
function lines(parts: readonly SafeHtml[]): SafeHtml {
  return raw(parts.map((part) => part.value).join('\n'));
}

function showcaseRow({ event, available }: ShowcaseRow): SafeHtml {
  const path = eventPagePath(event.id);
  const purchase = available > 0 ? html`<a href="${path}">${BUY_LABEL}</a>` : html`${SOLD_OUT_MESSAGE}`;
  return html`<tr data-evento="${event.id}"><td><a href="${path}">${event.name}</a></td><td>${formatDateTimeBR(event.startsAt)}</td><td>${event.location}</td><td>${formatBRL(event.priceCents)}</td><td>${String(available)}</td><td>${purchase}</td></tr>`;
}

/** GET / (5.2): tabela dos eventos à venda, na ordem dada, ou a mensagem de vitrine vazia. */
export function showcaseContent(rows: readonly ShowcaseRow[]): SafeHtml {
  if (rows.length === 0) {
    return lines([html`<h1>${SHOWCASE_TITLE}</h1>`, html`<p>${EMPTY_SHOWCASE_MESSAGE}</p>`]);
  }
  return lines([
    html`<h1>${SHOWCASE_TITLE}</h1>`,
    html`<table>`,
    html`<thead><tr><th>Evento</th><th>Data e hora</th><th>Local</th><th>Preço</th><th>Vagas disponíveis</th><th>Compra</th></tr></thead>`,
    html`<tbody>`,
    ...rows.map(showcaseRow),
    html`</tbody>`,
    html`</table>`,
  ]);
}

/** Linhas do bloco de compra (entre <section data-compra="…"> e </section>), spec 5.3. */
function purchaseBlockLines(kind: PurchaseBlockKind, eventId: string): SafeHtml[] {
  switch (kind) {
    case 'formulario':
      return [
        html`<h2>Comprar ingresso</h2>`,
        html`<form method="post" action="${purchasePath(eventId)}">`,
        html`<label for="cartao">${CARD_FIELD_LABEL}</label>`,
        // Sem value (o número nunca volta preenchido) e sem validação do navegador.
        html`<input id="cartao" name="cartao" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="16 dígitos">`,
        html`<button type="submit">${BUY_LABEL}</button>`,
        html`</form>`,
      ];
    case 'esgotado':
      return [html`<p><strong>${SOLD_OUT_MESSAGE}</strong></p>`];
    case 'entrar':
      return [html`<p><a href="${loginPath(eventPagePath(eventId))}">${LOGIN_TO_BUY_LABEL}</a></p>`];
    case 'organizador':
      return [html`<p>${ORGANIZER_PURCHASE_MESSAGE}</p>`];
  }
}

/** O bloco de compra inteiro, de <section data-compra="…"> a </section>. */
export function purchaseBlock(kind: PurchaseBlockKind, eventId: string): SafeHtml {
  return lines([html`<section data-compra="${kind}">`, ...purchaseBlockLines(kind, eventId), html`</section>`]);
}

/** GET /eventos/:id (5.3): dados do evento, vagas e o bloco de compra. */
export function eventPageContent(event: EventRecord, available: number, kind: PurchaseBlockKind): SafeHtml {
  return lines([
    html`<h1>${event.name}</h1>`,
    html`<dl>`,
    html`<dt>Data e hora</dt><dd>${formatDateTimeBR(event.startsAt)}</dd>`,
    html`<dt>Local</dt><dd>${event.location}</dd>`,
    html`<dt>Preço</dt><dd>${formatBRL(event.priceCents)}</dd>`,
    html`<dt>Vagas disponíveis</dt><dd>${String(available)}</dd>`,
    html`</dl>`,
    purchaseBlock(kind, event.id),
    BACK_TO_SHOWCASE,
  ]);
}

/** 404 (5.3): idêntico para rascunho, cancelado, inexistente e id inválido; nenhum dado do evento. */
export function eventNotFoundContent(): SafeHtml {
  return lines([html`<h1>${EVENT_NOT_FOUND_MESSAGE}</h1>`, BACK_TO_SHOWCASE]);
}
