// Validações das entradas da compra e dos identificadores do ingresso (spec 5.1, 5.2).

const CARD_NUMBER = /^[0-9]{16}$/;
const TICKET_ID = /^tkt_[a-z0-9]{16}$/;
const TICKET_CODE = /^[A-Z0-9]{8}$/;
// Mesma regra de e-mail do cadastro (F02).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;

function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Exatamente 16 dígitos, como digitado (sem trim, sem remover espaços ou hífens). */
export function isValidCardNumber(value: unknown): value is string {
  return typeof value === 'string' && CARD_NUMBER.test(value);
}

/** E-mail do comprador (regra da F02): sem espaços nas pontas, formato a@b.c, até 254 caracteres. */
export function isValidBuyerEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  return EMAIL_PATTERN.test(email) && !hasControlChars(email) && [...email].length <= EMAIL_MAX;
}

/** Como o e-mail é gravado: sem espaços nas pontas e em minúsculas. */
export function normalizeBuyerEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isTicketId(value: unknown): value is string {
  return typeof value === 'string' && TICKET_ID.test(value);
}

/** Código já normalizado: exatamente 8 caracteres A-Z0-9. */
export function isTicketCode(value: unknown): value is string {
  return typeof value === 'string' && TICKET_CODE.test(value);
}

/** Sem espaços nas pontas e em maiúsculas (" k7q2m9xa " → "K7Q2M9XA"). */
export function normalizeTicketCode(value: string): string {
  return value.trim().toUpperCase();
}
