// API de parceiros nos testes de qualquer feature (F07, F09): as três rotas por app.inject, com a
// chave da configuração da aplicação; o corpo já vem interpretado (em erro, { error }).
import { randomToken } from '../../src/core/ids.js';
import type { FastifyInstance } from 'fastify';
import type {
  PartnerErrorBody,
  PartnerEvent,
  PartnerTicket,
  PurchaseAccepted,
} from '../../src/features/parceiros/responses.js';

export interface PartnerResponse<T> {
  statusCode: number;
  body: T | PartnerErrorBody;
}

/** Cabeçalhos de uma chamada de parceiro: a chave da aplicação e Content-Type JSON. */
export function partnerHeaders(app: FastifyInstance, extra: Record<string, string> = {}): Record<string, string> {
  return { 'x-api-key': app.config.partnerApiKey, 'content-type': 'application/json', ...extra };
}

/** GET /api/partner/events com a chave. */
export async function partnerEvents(app: FastifyInstance): Promise<PartnerResponse<PartnerEvent[]>> {
  const response = await app.inject({
    method: 'GET',
    url: '/api/partner/events',
    headers: { 'x-api-key': app.config.partnerApiKey },
  });
  return { statusCode: response.statusCode, body: response.json<PartnerEvent[] | PartnerErrorBody>() };
}

/**
 * POST /api/partner/events/{eventId}/purchases com a chave e o JSON do brief. Padrões:
 * buyerEmail api.<aleatório>@example.com e cardNumber 4000000000000001 (aprovado em 2–5 s).
 */
export async function partnerPurchase(
  app: FastifyInstance,
  eventId: string,
  body: { buyerEmail?: string; cardNumber?: string } = {},
): Promise<PartnerResponse<PurchaseAccepted>> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/partner/events/${encodeURIComponent(eventId)}/purchases`,
    headers: partnerHeaders(app),
    payload: JSON.stringify({
      buyerEmail: body.buyerEmail ?? `api.${randomToken(8)}@example.com`,
      cardNumber: body.cardNumber ?? '4000000000000001',
    }),
  });
  return { statusCode: response.statusCode, body: response.json<PurchaseAccepted | PartnerErrorBody>() };
}

/** GET /api/partner/tickets/{ticketId} com a chave. */
export async function partnerTicket(app: FastifyInstance, ticketId: string): Promise<PartnerResponse<PartnerTicket>> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/partner/tickets/${encodeURIComponent(ticketId)}`,
    headers: { 'x-api-key': app.config.partnerApiKey },
  });
  return { statusCode: response.statusCode, body: response.json<PartnerTicket | PartnerErrorBody>() };
}
