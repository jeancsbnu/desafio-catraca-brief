// Utilitários dos testes da F04: formulários, datas relativas no fuso do produto, criação de
// eventos pela rota e "foto" da linha do evento para provar que nada mudou.
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { formatDateTimeBR } from '../../src/core/format.js';
import type { Db } from '../../src/db/pool.js';

export const LOCATION_CREATED = /^\/organizador\/eventos\/(evt_[a-z0-9]{16})\?ok=criado$/;

/** POST application/x-www-form-urlencoded (URLSearchParams para campos repetidos). */
export function postForm(
  app: FastifyInstance,
  url: string,
  fields: Readonly<Record<string, string>> | URLSearchParams,
  cookie?: string,
): Promise<LightMyRequestResponse> {
  const params = fields instanceof URLSearchParams ? fields : new URLSearchParams(fields);
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
    payload: params.toString(),
  });
}

export function get(app: FastifyInstance, url: string, cookie?: string): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
}

/** POST sem corpo (como curl -X POST). */
export function postEmpty(app: FastifyInstance, url: string, cookie?: string): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'POST', url, headers: cookie ? { cookie } : {} });
}

const pad = (n: number): string => String(n).padStart(2, '0');

interface Ymd {
  year: number;
  month: number;
  day: number;
}

function todayInProductZone(): Ymd {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) /.exec(formatDateTimeBR(new Date()));
  if (!match) throw new Error('data atual ilegível');
  return { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) };
}

export interface FormDate {
  /** AAAA-MM-DDTHH:MM */
  iso: string;
  /** DD/MM/AAAA HH:MM */
  br: string;
}

function formDate(ymd: Ymd, time: string): FormDate {
  return {
    iso: `${ymd.year}-${pad(ymd.month)}-${pad(ymd.day)}T${time}`,
    br: `${pad(ymd.day)}/${pad(ymd.month)}/${ymd.year} ${time}`,
  };
}

/** Dia `day` do mês `monthsAhead` meses depois do atual (fuso do produto), no horário dado. */
export function monthsAhead(months: number, day: number, time: string): FormDate {
  const today = todayInProductZone();
  const index = today.month - 1 + months;
  return formDate({ year: today.year + Math.floor(index / 12), month: (index % 12) + 1, day }, time);
}

/** Ontem (fuso do produto), no horário dado. */
export function yesterday(time: string): FormDate {
  const today = todayInProductZone();
  const date = new Date(Date.UTC(today.year, today.month - 1, today.day - 1));
  return formDate({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }, time);
}

export const PROX = monthsAhead(1, 15, '21:00');
export const DEPOIS = monthsAhead(2, 20, '20:30');
export const ONTEM = yesterday('21:00');

export interface EventFields {
  nome: string;
  inicio: string;
  local: string;
  lotacao: string;
  preco: string;
}

export function eventFields(overrides: Partial<EventFields> = {}): EventFields {
  return { nome: 'Show F04', inicio: PROX.iso, local: 'Bar do Centro', lotacao: '2', preco: '100,00', ...overrides };
}

/** Cria pela rota (exige 302) e devolve o id do evento. */
export async function createViaHttp(app: FastifyInstance, cookie: string, overrides: Partial<EventFields> = {}): Promise<string> {
  const response = await postForm(app, '/organizador/eventos', { ...eventFields(overrides) }, cookie);
  const id = LOCATION_CREATED.exec(String(response.headers.location ?? ''))?.[1];
  if (response.statusCode !== 302 || id === undefined) {
    throw new Error(`createViaHttp: ${response.statusCode} ${String(response.headers.location)}`);
  }
  return id;
}

/** Linha completa do evento (inclusive updated_at), para comparar antes e depois. */
export async function snapshot(db: Db, id: string): Promise<string> {
  const { rows } = await db.query('SELECT * FROM events WHERE id = $1', [id]);
  return JSON.stringify(rows);
}

export async function countEvents(db: Db): Promise<number> {
  const { rows } = await db.query<{ n: number }>('SELECT count(*) AS n FROM events');
  return rows[0]?.n ?? -1;
}

/** Quantas vezes o texto aparece no corpo. */
export function occurrences(body: string, text: string): number {
  return body.split(text).length - 1;
}
