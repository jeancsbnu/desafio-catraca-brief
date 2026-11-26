// Textos exatos do módulo eventos (PRD F04 e seções 5.2–5.10 da spec), byte a byte.

export const MESSAGES = Object.freeze({
  nameRequired: 'Informe o nome do evento',
  nameTooLong: 'O nome pode ter no máximo 120 caracteres',
  startsAtFormat: 'Informe a data e hora de início no formato DD/MM/AAAA HH:MM',
  startsAtPast: 'A data de início precisa estar no futuro',
  locationRequired: 'Informe o local do evento',
  locationTooLong: 'O local pode ter no máximo 200 caracteres',
  capacityInvalid: 'A lotação precisa ser um número inteiro maior ou igual a 1',
  capacityTooLarge: 'A lotação pode ser no máximo 1.000.000',
  priceInvalid: 'O preço precisa ser maior que zero',
  priceDecimals: 'O preço pode ter no máximo 2 casas decimais',
  priceTooLarge: 'O preço pode ser no máximo R$ 1.000.000,00',
  capacityBelowOccupied: 'A lotação não pode ficar menor que as vagas ocupadas',
  eventCancelled: 'Este evento foi cancelado e não pode mais ser alterado',
  alreadyPublished: 'Este evento já está publicado',
  onlyPublishedCanBeCancelled: 'Só evento publicado pode ser cancelado',
  cancelConfirmation: 'Cancelar é irreversível. Confirmar?',
});

/** Texto da página 404 de evento (reusado pela vitrine, F06). */
export const EVENT_NOT_FOUND_MESSAGE = 'Evento não encontrado';

export type SuccessCode = 'criado' | 'atualizado' | 'publicado' | 'cancelado';

/** Mensagens de sucesso pelo código do ?ok= da página de gestão. */
export const SUCCESS_MESSAGES: Readonly<Record<SuccessCode, string>> = Object.freeze({
  criado: 'Evento criado',
  atualizado: 'Evento atualizado',
  publicado: 'Evento publicado',
  cancelado: 'Evento cancelado com sucesso',
});

/** Texto fixo do código ?ok=; qualquer outro valor (inclusive repetido ou não-texto) é ignorado. */
export function successMessageFor(code: unknown): string | undefined {
  if (typeof code !== 'string' || !Object.hasOwn(SUCCESS_MESSAGES, code)) return undefined;
  return SUCCESS_MESSAGES[code as SuccessCode];
}
