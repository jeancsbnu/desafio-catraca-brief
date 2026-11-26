// Textos exatos da vitrine (brief, PRD F06 e spec 5.6), byte a byte, e os caminhos públicos.

/** Título e <h1> da vitrine (mantidos da vitrine provisória da F01). */
export const SHOWCASE_TITLE = 'Eventos à venda';
/** Vitrine sem eventos à venda (mantido da F01). */
export const EMPTY_SHOWCASE_MESSAGE = 'Nenhum evento à venda no momento.';
/** R07: no lugar da compra e como resposta à tentativa sem vaga. */
export const SOLD_OUT_MESSAGE = 'Ingressos esgotados';
export const INVALID_CARD_MESSAGE = 'Número de cartão inválido';
export const ORGANIZER_PURCHASE_MESSAGE = 'Compras são feitas com uma conta de participante';
export const LOGIN_TO_BUY_LABEL = 'Entrar para comprar';
export const BUY_LABEL = 'Comprar';
export const CARD_FIELD_LABEL = 'Número do cartão';
export const BACK_TO_SHOWCASE_LABEL = 'Voltar para a vitrine';

/** /eventos/{id} (página pública do evento). */
export function eventPagePath(id: string): string {
  return `/eventos/${encodeURIComponent(id)}`;
}

/** /eventos/{id}/comprar (envio do formulário de compra). */
export function purchasePath(id: string): string {
  return `${eventPagePath(id)}/comprar`;
}
