// Validação do formulário do evento (criação e edição): uma mensagem por campo, na ordem Nome,
// Data e hora de início, Local, Lotação, Preço (seção 5.2).
import { parseCapacity, parsePriceCents, parseStartsAt } from './input.js';
import { MESSAGES } from './messages.js';
import type { EventDetails } from './repository.js';

/** Campos do formulário como digitados (ausente, repetido ou não-texto = vazio). */
export interface EventForm {
  nome: string;
  inicio: string;
  local: string;
  lotacao: string;
  preco: string;
}

export type EventInput = EventDetails;

export type EventFormValidation = { ok: true; values: EventInput } | { ok: false; messages: string[] };

const FIELDS = ['nome', 'inicio', 'local', 'lotacao', 'preco'] as const;

function textField(body: unknown, name: string): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' && Object.hasOwn(body, name) ? value : '';
}

export function readEventForm(body: unknown): EventForm {
  const form = {} as EventForm;
  for (const field of FIELDS) form[field] = textField(body, field);
  return form;
}

/** Caractere de controle (U+0000–U+001F, U+007F): o PostgreSQL recusa U+0000 em text. */
function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function codePoints(text: string): number {
  return [...text].length;
}

function checkText(text: string, max: number, required: string, tooLong: string): string | undefined {
  if (text === '' || hasControlChars(text)) return required;
  if (codePoints(text) > max) return tooLong;
  return undefined;
}

export function validateEventForm(form: EventForm, now: Date = new Date()): EventFormValidation {
  const messages: string[] = [];

  const name = form.nome.trim();
  const nameError = checkText(name, 120, MESSAGES.nameRequired, MESSAGES.nameTooLong);
  if (nameError) messages.push(nameError);

  const startsAt = parseStartsAt(form.inicio);
  if (startsAt === null) messages.push(MESSAGES.startsAtFormat);
  else if (startsAt.getTime() <= now.getTime()) messages.push(MESSAGES.startsAtPast);

  const location = form.local.trim();
  const locationError = checkText(location, 200, MESSAGES.locationRequired, MESSAGES.locationTooLong);
  if (locationError) messages.push(locationError);

  const capacity = parseCapacity(form.lotacao);
  if (!capacity.ok) messages.push(capacity.reason === 'maximo' ? MESSAGES.capacityTooLarge : MESSAGES.capacityInvalid);

  const price = parsePriceCents(form.preco);
  if (!price.ok) {
    if (price.reason === 'casas') messages.push(MESSAGES.priceDecimals);
    else if (price.reason === 'maximo') messages.push(MESSAGES.priceTooLarge);
    else messages.push(MESSAGES.priceInvalid);
  }

  if (messages.length > 0 || startsAt === null || !capacity.ok || !price.ok) {
    return { ok: false, messages };
  }
  return {
    ok: true,
    values: { name, startsAt, location, capacity: capacity.value, priceCents: price.cents },
  };
}
