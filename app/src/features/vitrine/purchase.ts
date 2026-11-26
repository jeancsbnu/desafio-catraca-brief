// Lógica do canal da vitrine: qual bloco de compra a página do evento mostra e para onde o
// visitante volta depois do login. Nenhuma regra de vaga, de status ou de evento à venda aqui:
// tudo vem de F04 (isOnSale) e F05 (vagas e serviço de compra).
import type { SessionUser } from '../contas/public.js';
import { eventPagePath } from './messages.js';

/** Variantes do bloco de compra (<section data-compra="…">), spec 5.3. */
export type PurchaseBlockKind = 'organizador' | 'esgotado' | 'entrar' | 'formulario';

/**
 * Primeira regra verdadeira: organizador → organizador; 0 vagas → esgotado; visitante → entrar;
 * participante → formulario.
 */
export function purchaseBlockKind(user: SessionUser | null, available: number): PurchaseBlockKind {
  if (user !== null && user.role === 'organizador') return 'organizador';
  if (available <= 0) return 'esgotado';
  if (user === null) return 'entrar';
  return 'formulario';
}

/** Página do evento, para onde o visitante volta depois do login (returnTo do guarda da F02). */
export function purchaseReturnPath(id: string): string {
  return eventPagePath(id);
}
