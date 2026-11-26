// Leitura dos campos do evento (seção 5.2): data e hora no fuso do produto, preço em reais e
// lotação; e os formatos de pré-preenchimento do formulário de edição.
import { formatDateTimeBR, productOffset } from '../../core/format.js';

const BR_FORMAT = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;
const ISO_FORMAT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

const MINUTE_MS = 60_000;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0); // dia 0 do mês seguinte = último dia do mês
  return date.getUTCDate();
}

/** "-03:00" → -180 (minutos a somar ao UTC para obter a hora local). */
function offsetMinutes(instantMs: number): number {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(productOffset(instantMs));
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

interface DateFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function readFields(text: string): DateFields | null {
  const br = BR_FORMAT.exec(text);
  if (br) {
    return {
      day: Number(br[1]),
      month: Number(br[2]),
      year: Number(br[3]),
      hour: Number(br[4]),
      minute: Number(br[5]),
      second: 0,
    };
  }
  const iso = ISO_FORMAT.exec(text);
  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3]),
      hour: Number(iso[4]),
      minute: Number(iso[5]),
      second: iso[6] === undefined ? 0 : Number(iso[6]),
    };
  }
  return null;
}

/**
 * "DD/MM/AAAA HH:MM" ou "AAAA-MM-DD[T ]HH:MM[:SS]" no fuso America/Sao_Paulo → instante; null se
 * o formato, a data de calendário ou o horário (inexistente no fuso) forem inválidos.
 */
export function parseStartsAt(text: string): Date | null {
  const fields = readFields(text.trim());
  if (fields === null) return null;
  const { year, month, day, hour, minute, second } = fields;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const wall = new Date(0);
  wall.setUTCFullYear(year, month - 1, day);
  wall.setUTCHours(hour, minute, second, 0);
  const wallMs = wall.getTime();

  // Offset do fuso no instante (duas passadas cobrem uma eventual mudança de horário).
  let instantMs = wallMs - offsetMinutes(wallMs) * MINUTE_MS;
  instantMs = wallMs - offsetMinutes(instantMs) * MINUTE_MS;
  const instant = new Date(instantMs);

  // O instante, formatado de volta no fuso, precisa reproduzir os campos digitados.
  const expected = `${pad2(day)}/${pad2(month)}/${String(year).padStart(4, '0')} ${pad2(hour)}:${pad2(minute)}`;
  if (formatDateTimeBR(instant) !== expected || instant.getUTCSeconds() !== second) return null;
  return instant;
}

export type PriceParseResult =
  | { ok: true; cents: number }
  | { ok: false; reason: 'formato' | 'casas' | 'nao_positivo' | 'maximo' };

const PRICE_FORMAT = /^-?\d+([.,]\d+)?$/;
const MAX_PRICE_CENTS = 100_000_000n;

/** "100,00", "100.00", "100", "R$ 100,00" → 10000; "42,5" → 4250; sem separador de milhar. */
export function parsePriceCents(text: string): PriceParseResult {
  const value = text.trim().replace(/^R\$\s*/, '');
  if (!PRICE_FORMAT.test(value)) return { ok: false, reason: 'formato' };
  const negative = value.startsWith('-');
  const [integerPart = '0', decimals = ''] = (negative ? value.slice(1) : value).split(/[.,]/);
  if (decimals.length > 2) return { ok: false, reason: 'casas' };
  const absolute = BigInt(integerPart) * 100n + BigInt(decimals.padEnd(2, '0'));
  const cents = negative ? -absolute : absolute;
  if (cents <= 0n) return { ok: false, reason: 'nao_positivo' };
  if (cents > MAX_PRICE_CENTS) return { ok: false, reason: 'maximo' };
  return { ok: true, cents: Number(cents) };
}

export type CapacityParseResult = { ok: true; value: number } | { ok: false; reason: 'invalida' | 'maximo' };

const MAX_CAPACITY = 1_000_000n;

/** Só dígitos, de 1 a 1.000.000 ("007" → 7). */
export function parseCapacity(text: string): CapacityParseResult {
  const value = text.trim();
  if (!/^\d+$/.test(value)) return { ok: false, reason: 'invalida' };
  const capacity = BigInt(value);
  if (capacity < 1n) return { ok: false, reason: 'invalida' };
  if (capacity > MAX_CAPACITY) return { ok: false, reason: 'maximo' };
  return { ok: true, value: Number(capacity) };
}

/** Pré-preenchimento do início: "DD/MM/AAAA HH:MM" no fuso do produto. */
export function formatStartsAtInput(date: Date): string {
  return formatDateTimeBR(date);
}

/** Pré-preenchimento do preço: reais com vírgula e duas casas, sem R$ nem milhar (15000 → "150,00"). */
export function formatPriceInput(cents: number): string {
  return `${Math.trunc(cents / 100)},${pad2(cents % 100)}`;
}
