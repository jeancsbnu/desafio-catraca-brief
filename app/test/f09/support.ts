// Utilitários dos testes da F09: o leitor do painel (o mesmo do contrato: a seção
// data-secao="painel" e os pares <dt>…</dt><dd data-metrica="…">…</dd>), a página de gestão com o
// painel lido, a linha esperada e contas de participante novas.
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { randomToken } from '../../src/core/ids.js';
import { hashPassword } from '../../src/core/password.js';
import { insertParticipant } from '../../src/features/contas/users.js';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs, sessionCookieFor } from '../helpers/session.js';

export const CARD_OK = '4000000000000001';
export const CARD_DECLINED_FAST = '4000000000000002';
export const CARD_SLOW_OK = '4000000000000003';
export const CARD_SLOW_DECLINED = '4000000000000004';

export interface PanelReading {
  /** A página tem a seção data-secao="painel". */
  present: boolean;
  /** Quantas seções do painel a página tem. */
  sections: number;
  /** "Confirmados 3 | Pendentes 0 | …" ou "painel: ausente" / "painel: sem números". */
  line: string;
  /** Valor exibido por chave data-metrica. */
  metrics: Record<string, string>;
  /** Rótulos na ordem exibida. */
  labels: string[];
  /** data-centavos da receita; null se ausente. */
  revenueCents: number | null;
  /** HTML da seção, da abertura até antes de </section>; '' se ausente. */
  html: string;
}

const OPENING = /<section\b[^>]*\bdata-secao="painel"[^>]*>/g;
const PAIR = /<dt>([^<]*)<\/dt><dd data-metrica="([a-z-]+)"(?: data-centavos="([0-9]+)")?>([^<]*)<\/dd>/g;

const hex = (char: string): string => (char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0');
/** Fora de ASCII imprimível e das letras acentuadas Latin-1 → <U+XXXX> (como o painel.js do contrato). */
const visible = (text: string): string => text.replace(/[^\x20-\x7e\xc0-\xff]/g, (char) => `<U+${hex(char)}>`);

export function readPanel(body: string): PanelReading {
  const openings = [...body.matchAll(OPENING)];
  const first = openings[0];
  if (first === undefined) {
    return { present: false, sections: 0, line: 'painel: ausente', metrics: {}, labels: [], revenueCents: null, html: '' };
  }
  const start = first.index;
  const end = body.indexOf('</section>', start);
  const section = body.slice(start, end < 0 ? body.length : end);
  const pairs = [...section.matchAll(PAIR)].map((m) => ({
    label: m[1] ?? '',
    key: m[2] ?? '',
    cents: m[3],
    value: m[4] ?? '',
  }));
  const metrics: Record<string, string> = {};
  for (const pair of pairs) metrics[pair.key] = pair.value;
  const revenue = pairs.find((pair) => pair.key === 'receita');
  return {
    present: true,
    sections: openings.length,
    line: pairs.length > 0 ? pairs.map((pair) => `${visible(pair.label)} ${visible(pair.value)}`).join(' | ') : 'painel: sem números',
    metrics,
    labels: pairs.map((pair) => pair.label),
    revenueCents: revenue?.cents === undefined ? null : Number(revenue.cents),
    html: section,
  };
}

/** Linha esperada do painel: Confirmados c | Pendentes p | Check-ins k | Vagas disponíveis v | Receita r | Estornados e. */
export function panelLine(c: number, p: number, k: number, v: number, receita: string, e: number): string {
  return `Confirmados ${c} | Pendentes ${p} | Check-ins ${k} | Vagas disponíveis ${v} | Receita ${receita} | Estornados ${e}`;
}

export type PanelPage = PanelReading & { statusCode: number; body: string; response: LightMyRequestResponse };

/** GET da página de gestão do evento com o cookie dado (ou sem cookie) e o painel lido. */
export async function panelOf(app: FastifyInstance, cookie: string | null, eventId: string): Promise<PanelPage> {
  const response = await app.inject({
    method: 'GET',
    url: `/organizador/eventos/${eventId}`,
    headers: cookie ? { cookie } : {},
  });
  return { ...readPanel(response.body), statusCode: response.statusCode, body: response.body, response };
}

/** Conta de participante nova (direto no banco) e o cookie de uma sessão dela. */
export async function participantCookie(app: FastifyInstance): Promise<{ userId: string; email: string; cookie: string }> {
  const email = `participante.f09.${randomToken(8)}@example.com`;
  const user = await insertParticipant(app.db, {
    name: 'Participante F09',
    email,
    passwordHash: await hashPassword('segredo-f09'),
  });
  return { userId: user.id, email, cookie: await sessionCookieFor(app, user.id) };
}

/** Aplicação com as contas da seed e os cookies dos organizadores A e B. */
export async function setup() {
  const test = await createTestApp();
  const accounts = await seedAccounts();
  const cookieA = await loginAs(test.app, 'organizador.a@catraca.test');
  const cookieB = await loginAs(test.app, 'organizador.b@catraca.test');
  return { ...test, accounts, cookieA, cookieB };
}

/** Quantas vezes o texto aparece no corpo. */
export function occurrences(body: string, text: string): number {
  return body.split(text).length - 1;
}
