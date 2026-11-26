// Tipos e textos do painel do evento (F09): os seis números de R12, na ordem do brief, cada um com
// o rótulo exato e a chave estável da marcação (data-metrica) que o avaliador lê.

/** Chaves estáveis da marcação (atributo data-metrica de cada valor). */
export type PanelMetricKey = 'confirmados' | 'pendentes' | 'check-ins' | 'vagas-disponiveis' | 'receita' | 'estornados';

/** Os seis números do painel de um evento, todos do mesmo instante do banco (spec 5.3). */
export interface EventPanel {
  /** Ingressos confirmed, inclusive os que já passaram pelo check-in. */
  confirmed: number;
  /** Ingressos pending. */
  pending: number;
  /** Ingressos confirmed com check-in (um refunded com check-in não conta). */
  checkIns: number;
  /** R05: lotação − (pendentes + confirmados), mínimo 0; 0 em evento cancelado. */
  availableSeats: number;
  /** Soma de price_paid_cents dos confirmed (valor pago em cada compra, R03). */
  revenueCents: number;
  /** Ingressos refunded. */
  refunded: number;
}

export interface PanelMetric {
  key: PanelMetricKey;
  /** Rótulo exato do brief (R12). */
  label: string;
  field: keyof EventPanel;
  /** count: inteiro sem separador de milhar; money: formatBRL e data-centavos. */
  kind: 'count' | 'money';
}

function metric(key: PanelMetricKey, label: string, field: keyof EventPanel, kind: PanelMetric['kind'] = 'count'): PanelMetric {
  return Object.freeze({ key, label, field, kind });
}

/** Os seis números, na ordem em que aparecem (spec 5.2 e 5.3). */
export const PANEL_METRICS: readonly PanelMetric[] = Object.freeze([
  metric('confirmados', 'Confirmados', 'confirmed'),
  metric('pendentes', 'Pendentes', 'pending'),
  metric('check-ins', 'Check-ins', 'checkIns'),
  metric('vagas-disponiveis', 'Vagas disponíveis', 'availableSeats'),
  metric('receita', 'Receita', 'revenueCents', 'money'),
  metric('estornados', 'Estornados', 'refunded'),
]);

/** Seção da página de gestão (F04): logo abaixo do check-in da F08 (ordem 100). */
export const PANEL_SECTION_NAME = 'painel';
export const PANEL_SECTION_ORDER = 200;

export const PANEL_TITLE = 'Painel';
export const PANEL_NOTE = 'Números do momento em que a página foi aberta. Recarregue para atualizar.';
export const PANEL_UNAVAILABLE_MESSAGE = 'Painel indisponível no momento. Recarregue a página.';

/** Mensagem do log de erro quando o cálculo falha (spec 5.7). */
export const PANEL_ERROR_LOG = 'painel: falha ao calcular o painel';
