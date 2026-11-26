// Utilitários dos testes da F06: contas de participante pelo cadastro (F02), envio do formulário de
// compra da vitrine e leitura das linhas exatas do HTML (linha da vitrine, bloco de compra, linhas de
// "Meus ingressos").
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Queryable } from '../../src/db/pool.js';

export const CARD_OK = '4000000000000001';

let accounts = 0;

export interface Participant {
  userId: string;
  email: string;
  cookie: string;
}

function sessionCookieOf(response: LightMyRequestResponse): string {
  const header = response.headers['set-cookie'];
  const cookies = header === undefined ? [] : Array.isArray(header) ? header : [header];
  for (const cookie of cookies) {
    const pair = cookie.split(';')[0] ?? '';
    if (pair.startsWith('catraca_sessao=') && pair.length > 'catraca_sessao='.length) return pair;
  }
  throw new Error('a resposta não criou sessão');
}

/** Conta de participante nova pelo POST /cadastro (senha segredo123); devolve a sessão aberta. */
export async function signupParticipant(
  app: FastifyInstance,
  options: { name?: string; email?: string } = {},
): Promise<Participant> {
  accounts += 1;
  const email = options.email ?? `participante-f06-${accounts}-${Date.now()}@example.com`;
  const response = await app.inject({
    method: 'POST',
    url: '/cadastro',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ nome: options.name ?? 'Participante F06', email, senha: 'segredo123' }).toString(),
  });
  if (response.statusCode !== 302) {
    throw new Error(`signupParticipant: POST /cadastro respondeu ${response.statusCode}`);
  }
  const { rows } = await app.db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  const userId = rows[0]?.id;
  if (userId === undefined) throw new Error('signupParticipant: conta não encontrada');
  return { userId, email: email.toLowerCase(), cookie: sessionCookieOf(response) };
}

/**
 * POST /eventos/{id}/comprar como formulário. cartao undefined = sem o campo; cookie null = sem
 * sessão; headers extras (ex.: Origin).
 */
export function postPurchase(
  app: FastifyInstance,
  cookie: string | null,
  eventId: string,
  cartao?: string,
  headers: Readonly<Record<string, string>> = {},
): Promise<LightMyRequestResponse> {
  const payload = cartao === undefined ? '' : new URLSearchParams({ cartao }).toString();
  return app.inject({
    method: 'POST',
    url: `/eventos/${eventId}/comprar`,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie === null ? {} : { cookie }),
      ...headers,
    },
    payload,
  });
}

export function get(app: FastifyInstance, url: string, cookie?: string | null): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
}

/** A linha <tr data-evento="{id}"> da vitrine (uma linha do HTML) ou null. */
export function showcaseRow(body: string, eventId: string): string | null {
  return body.split('\n').find((line) => line.startsWith(`<tr data-evento="${eventId}">`)) ?? null;
}

/** O bloco de compra: o valor de data-compra e as linhas de <section …> a </section>. */
export function purchaseBlock(body: string): { kind: string; html: string } | null {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => line.startsWith('<section data-compra="'));
  if (start < 0) return null;
  const end = lines.indexOf('</section>', start);
  if (end < 0) return null;
  const kind = /^<section data-compra="([a-z]+)">$/.exec(lines[start] ?? '')?.[1] ?? '';
  return { kind, html: lines.slice(start, end + 1).join('\n') };
}

/** Bloco [formulário] exato da spec 5.3. */
export function formBlock(eventId: string): string {
  return [
    '<section data-compra="formulario">',
    '<h2>Comprar ingresso</h2>',
    `<form method="post" action="/eventos/${eventId}/comprar">`,
    '<label for="cartao">Número do cartão</label>',
    '<input id="cartao" name="cartao" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="16 dígitos">',
    '<button type="submit">Comprar</button>',
    '</form>',
    '</section>',
  ].join('\n');
}

export const SOLD_OUT_BLOCK = '<section data-compra="esgotado">\n<p><strong>Ingressos esgotados</strong></p>\n</section>';
export const ORGANIZER_BLOCK =
  '<section data-compra="organizador">\n<p>Compras são feitas com uma conta de participante</p>\n</section>';

export function loginBlock(eventId: string): string {
  return `<section data-compra="entrar">\n<p><a href="/entrar?voltar=%2Feventos%2F${eventId}">Entrar para comprar</a></p>\n</section>`;
}

export interface TicketLine {
  event: string;
  date: string;
  status: string;
  label: string;
  code: string;
}

const TICKET_LINE =
  /^<tr><td>([^<]*)<\/td><td>([^<]*)<\/td><td data-status="([a-z]+)">([a-z]+)<\/td><td><code>([A-Z0-9]{8})<\/code><\/td><\/tr>$/;

/** As linhas da tabela de "Meus ingressos"; uma linha fora do formato lança erro. */
export function ticketRows(body: string): TicketLine[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('<tr><td>'))
    .map((line) => {
      const match = TICKET_LINE.exec(line);
      if (!match) throw new Error(`linha de "Meus ingressos" fora do formato: ${line}`);
      return { event: match[1] ?? '', date: match[2] ?? '', status: match[3] ?? '', label: match[4] ?? '', code: match[5] ?? '' };
    });
}

export const ERROR_MESSAGE = (text: string): string => `<p class="msg msg-error" role="alert">${text}</p>`;
export const SUCCESS_MESSAGE = (text: string): string => `<p class="msg msg-success" role="status">${text}</p>`;

/** Ingressos do evento (todos os status). */
export async function countTickets(db: Queryable, eventId?: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    eventId === undefined ? 'SELECT count(*) AS n FROM tickets' : 'SELECT count(*) AS n FROM tickets WHERE event_id = $1',
    eventId === undefined ? [] : [eventId],
  );
  return rows[0]?.n ?? -1;
}

export async function countPaymentAttempts(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ n: number }>('SELECT count(*) AS n FROM payment_attempts');
  return rows[0]?.n ?? -1;
}

/** Instante de uma data do formulário (AAAA-MM-DDTHH:MM) no fuso do produto (-03:00, sem horário de verão). */
export function productDate(date: { iso: string }): Date {
  return new Date(`${date.iso}:00-03:00`);
}
