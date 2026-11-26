// Formatos do produto: dinheiro em reais (a partir de centavos) e datas no fuso America/Sao_Paulo.

export const PRODUCT_TIMEZONE = 'America/Sao_Paulo';

export type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Data inválida: ${String(value)}`);
  }
  return date;
}

/** Centavos → "R$ 1.234,56" (espaço comum depois de R$, ponto no milhar, vírgula nos centavos). */
export function formatBRL(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Valor em centavos inválido: ${cents}`);
  }
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.trunc(abs / 100).toString();
  const centavos = (abs % 100).toString().padStart(2, '0');
  const reaisComMilhar = reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}R$ ${reaisComMilhar},${centavos}`;
}

const dateTimeParts = new Intl.DateTimeFormat('pt-BR', {
  timeZone: PRODUCT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const offsetParts = new Intl.DateTimeFormat('en-US', {
  timeZone: PRODUCT_TIMEZONE,
  timeZoneName: 'longOffset',
});

function partsOf(date: Date): Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string> {
  const map = new Map<string, string>();
  for (const part of dateTimeParts.formatToParts(date)) {
    map.set(part.type, part.value);
  }
  const get = (type: string): string => map.get(type) ?? '00';
  return {
    year: get('year').padStart(4, '0'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === '24' ? '00' : get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** "dd/mm/aaaa hh:mm" no fuso do produto (sem a vírgula do Intl pt-BR). */
export function formatDateTimeBR(value: DateInput): string {
  const p = partsOf(toDate(value));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Offset do fuso do produto na data, no formato "-03:00". */
export function productOffset(value: DateInput): string {
  const name = offsetParts.formatToParts(toDate(value)).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /^GMT([+-]\d{2}):?(\d{2})?$/.exec(name);
  if (!match) return '+00:00';
  return `${match[1]}:${match[2] ?? '00'}`;
}

/** ISO 8601 com segundos e o offset do fuso do produto: "2026-12-05T21:00:00-03:00". */
export function toIsoWithOffset(value: DateInput): string {
  const date = toDate(value);
  const p = partsOf(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${productOffset(date)}`;
}
