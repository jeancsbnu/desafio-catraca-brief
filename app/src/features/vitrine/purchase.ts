// Lógica do canal da vitrine: qual bloco de compra a página do evento mostra, para onde o visitante
// volta depois do login, a leitura do número do cartão e a tradução do resultado do serviço de
// compra. Nenhuma regra de vaga, de status ou de evento à venda aqui: tudo vem de F04 (isOnSale) e
// F05 (vagas e serviço de compra).
import type { SessionUser } from '../contas/public.js';
import type { PurchaseResult } from '../ingressos/public.js';
import { INVALID_CARD_MESSAGE, SOLD_OUT_MESSAGE, eventPagePath } from './messages.js';

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

/**
 * Campo cartao do formulário sem nenhum caractere de espaço em branco (pontas e meio). Ausente,
 * repetido ou não-texto = ''. A validade (exatamente 16 dígitos) é decidida só pelo serviço (F05).
 */
export function readCardNumber(body: unknown): string {
  if (typeof body !== 'object' || body === null || !Object.hasOwn(body, 'cartao')) return '';
  const value = (body as Record<string, unknown>).cartao;
  return typeof value === 'string' ? value.replace(/\s/gu, '') : '';
}

/** O que a rota de compra responde para cada resultado do serviço (spec 5.4). */
export type PurchaseOutcome =
  | { kind: 'registered' }
  | { kind: 'event-page'; status: 409 | 422; message: string }
  | { kind: 'not-found' };

export function purchaseOutcome(result: PurchaseResult): PurchaseOutcome {
  if (result.ok) return { kind: 'registered' };
  switch (result.reason) {
    case 'sold_out':
      return { kind: 'event-page', status: 409, message: SOLD_OUT_MESSAGE };
    case 'event_not_available':
      return { kind: 'not-found' };
    case 'invalid_request':
      if (result.field === 'cardNumber') return { kind: 'event-page', status: 422, message: INVALID_CARD_MESSAGE };
      // Conta ausente ou sem papel de participante (só numa corrida): 500 da F01.
      throw new Error('vitrine: comprador recusado pelo serviço de compra');
  }
}
