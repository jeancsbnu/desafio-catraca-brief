// Corpo da compra (spec 5.4): o escopo entrega o corpo cru como texto; aqui se decide, numa função
// só e na ordem do brief, o que é corpo inválido (422 invalid_request): Content-Type que não é
// application/json, JSON malformado ou vazio, valor que não é objeto, buyerEmail ou cardNumber
// faltando, não-texto ou mal formado. Campos extras são ignorados (lidos só por Object.hasOwn).
import { isValidBuyerEmail, isValidCardNumber } from '../ingressos/public.js';

/** Limite do corpo lido no escopo (o corpo do brief tem menos de 100 bytes). */
export const PURCHASE_BODY_LIMIT = 16384;

export type PurchaseBodyFailure = 'content_type' | 'json' | 'objeto' | 'buyerEmail' | 'cardNumber';

export type ParsedPurchaseBody =
  | { ok: true; buyerEmail: string; cardNumber: string }
  | { ok: false; reason: PurchaseBodyFailure };

/** Tipo de mídia (antes do primeiro ";", sem espaços nas pontas, sem diferenciar maiúsculas) = application/json. */
export function isJsonContentType(header: unknown): boolean {
  if (typeof header !== 'string') return false;
  const semicolon = header.indexOf(';');
  const mediaType = (semicolon === -1 ? header : header.slice(0, semicolon)).trim().toLowerCase();
  return mediaType === 'application/json';
}

function fail(reason: PurchaseBodyFailure): ParsedPurchaseBody {
  return { ok: false, reason };
}

function ownField(value: object, name: string): unknown {
  return Object.hasOwn(value, name) ? (value as Record<string, unknown>)[name] : undefined;
}

export function parsePurchaseBody(contentType: unknown, rawBody: unknown): ParsedPurchaseBody {
  if (!isJsonContentType(contentType)) return fail('content_type');
  if (typeof rawBody !== 'string' || rawBody === '') return fail('json');

  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return fail('json');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('objeto');

  const buyerEmail = ownField(value, 'buyerEmail');
  if (typeof buyerEmail !== 'string' || !isValidBuyerEmail(buyerEmail)) return fail('buyerEmail');
  const cardNumber = ownField(value, 'cardNumber');
  if (!isValidCardNumber(cardNumber)) return fail('cardNumber');

  return { ok: true, buyerEmail, cardNumber };
}
