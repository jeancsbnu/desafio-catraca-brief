// Utilitários dos testes da F08: aplicação com as contas da seed e o cookie do organizador A,
// "foto" da linha do ingresso para provar que nada mudou, captura dos logs checkin: e o HTML da seção.
import type { FastifyInstance } from 'fastify';
import { vi } from 'vitest';
import type { Db } from '../../src/db/pool.js';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';

/** captureLogs: registra os request.log.info (o hook entra antes do primeiro inject, o loginAs). */
export async function setup(options: { captureLogs?: boolean } = {}) {
  const test = await createTestApp();
  const logs = options.captureLogs === true ? captureRequestLogs(test.app) : [];
  const accounts = await seedAccounts();
  const cookieA = await loginAs(test.app, 'organizador.a@catraca.test');
  return { ...test, accounts, cookieA, logs };
}

/** Linha completa do ingresso (todas as colunas), para comparar antes e depois. */
export async function ticketSnapshot(db: Db, id: string): Promise<string> {
  const { rows } = await db.query('SELECT * FROM tickets WHERE id = $1', [id]);
  return JSON.stringify(rows);
}

export interface TicketMark {
  status: string;
  checked_in: boolean;
  checked_in_at: Date | null;
}

export async function ticketMark(db: Db, id: string): Promise<TicketMark | undefined> {
  const { rows } = await db.query<TicketMark>('SELECT status, checked_in, checked_in_at FROM tickets WHERE id = $1', [id]);
  return rows[0];
}

export interface LogCall {
  msg: unknown;
  data: unknown;
}

/**
 * Registra as chamadas de request.log.info de todas as requisições (antes do primeiro inject: os
 * hooks valem para as rotas já registradas porque o Fastify os resolve no preReady).
 */
export function captureRequestLogs(app: FastifyInstance): LogCall[] {
  const calls: LogCall[] = [];
  app.addHook('onRequest', async (request) => {
    vi.spyOn(request.log, 'info').mockImplementation((data: unknown, msg: unknown) => {
      calls.push({ data, msg });
    });
  });
  return calls;
}

export function checkinLogs(calls: readonly LogCall[]): LogCall[] {
  return calls.filter((call) => typeof call.msg === 'string' && call.msg.startsWith('checkin:'));
}

/** HTML da seção sem envio (spec 5.5), como a F04 a embrulha. */
export function emptySectionHtml(eventId: string): string {
  return [
    '<section class="gestao-secao" data-secao="checkin"><h2>Check-in</h2>',
    `<form method="post" action="/organizador/eventos/${eventId}/checkin">`,
    '<label for="codigo">Código</label>',
    '<input id="codigo" name="codigo" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" value="">',
    '<button type="submit">Validar</button>',
    '</form></section>',
  ].join('\n');
}

export const FOCUSED_INPUT =
  '<input id="codigo" name="codigo" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" value="" autofocus>';

/** Quantas vezes o texto aparece no corpo. */
export function occurrences(body: string, text: string): number {
  return body.split(text).length - 1;
}
