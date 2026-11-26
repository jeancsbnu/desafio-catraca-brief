// HTML da seção "Painel" (spec 5.2 e 5.6). A F04 embrulha o fragmento em
// <section class="gestao-secao" data-secao="painel">. Cada par rótulo/valor fica numa linha, com a
// chave estável data-metrica (e data-centavos na receita) para a conferência número a número.
import { formatBRL } from '../../core/format.js';
import { html, raw, type SafeHtml } from '../../core/html.js';
import {
  PANEL_METRICS,
  PANEL_NOTE,
  PANEL_TITLE,
  PANEL_UNAVAILABLE_MESSAGE,
  type EventPanel,
  type PanelMetric,
} from './types.js';

function lines(parts: readonly SafeHtml[]): SafeHtml {
  return raw(parts.map((part) => part.value).join('\n'));
}

function metricLine(metric: PanelMetric, panel: EventPanel): SafeHtml {
  const value = panel[metric.field];
  if (metric.kind === 'money') {
    // formatBRL: "R$ 1.234,56" com espaço comum (U+0020) depois de R$.
    return html`<dt>${metric.label}</dt><dd data-metrica="${metric.key}" data-centavos="${String(value)}">${formatBRL(value)}</dd>`;
  }
  return html`<dt>${metric.label}</dt><dd data-metrica="${metric.key}">${String(value)}</dd>`;
}

/** Título, os seis números na ordem do brief e a nota de atualização por recarga. */
export function panelContent(panel: EventPanel): SafeHtml {
  return lines([
    html`<h2>${PANEL_TITLE}</h2>`,
    html`<dl>`,
    ...PANEL_METRICS.map((metric) => metricLine(metric, panel)),
    html`</dl>`,
    html`<p>${PANEL_NOTE}</p>`,
  ]);
}

/** Falha no cálculo: só o título e o aviso, sem nenhum número. */
export function panelUnavailableContent(): SafeHtml {
  return lines([html`<h2>${PANEL_TITLE}</h2>`, html`<p>${PANEL_UNAVAILABLE_MESSAGE}</p>`]);
}
