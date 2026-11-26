// Check-in pelo HTTP para os testes de qualquer feature (F08, F09): POST
// /organizador/eventos/{id}/checkin com o campo codigo e o resultado lido da seção de check-in.
import type { FastifyInstance } from 'fastify';
import { checkInPath, type CheckInResult } from '../../src/features/checkin/public.js';

export interface CheckInResponse {
  statusCode: number;
  /** data-checkin-resultado da seção; null se a página não tem resultado (404, 403, 302...). */
  result: CheckInResult | null;
  /** Texto do elemento de resultado; null se ausente. */
  message: string | null;
  body: string;
}

const RESULT_ELEMENT = /data-checkin-resultado="([a-z_]+)">([^<]*)<\/p>/;

/** Faz o POST (application/x-www-form-urlencoded) com o cookie dado (ou sem cookie, se vazio). */
export async function postCheckIn(app: FastifyInstance, cookie: string, eventId: string, code: string): Promise<CheckInResponse> {
  const response = await app.inject({
    method: 'POST',
    url: checkInPath(eventId),
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
    payload: new URLSearchParams({ codigo: code }).toString(),
  });
  const match = RESULT_ELEMENT.exec(response.body);
  return {
    statusCode: response.statusCode,
    result: (match?.[1] as CheckInResult | undefined) ?? null,
    message: match?.[2] ?? null,
    body: response.body,
  };
}
