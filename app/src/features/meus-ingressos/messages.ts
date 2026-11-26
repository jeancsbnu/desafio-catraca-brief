// Textos exatos de "Meus ingressos" (spec 5.5 e 5.6) e o caminho de volta depois da compra, que a
// vitrine importa (importação interna entre os dois módulos da própria F06).

/** Título e <h1> (mantidos da página mínima da F02). */
export const MY_TICKETS_TITLE = 'Meus ingressos';
/** Lista vazia (mantido da F02). */
export const NO_TICKETS_MESSAGE = 'Você ainda não tem ingressos.';
/** Código do ?ok= que a compra pela vitrine usa no redirecionamento. */
export const PURCHASE_OK_CODE = 'compra';
export const PURCHASE_REGISTERED_MESSAGE = 'Compra registrada';

export const MY_TICKETS_PATH = '/meus-ingressos';

/** /meus-ingressos?ok=compra: destino do 302 da compra registrada. */
export function myTicketsAfterPurchasePath(): string {
  return `${MY_TICKETS_PATH}?ok=${PURCHASE_OK_CODE}`;
}
