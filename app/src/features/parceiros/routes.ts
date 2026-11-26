// Escopo /api/partner (spec 5.1): tudo da API de parceiros vive aqui, registrado nesta ordem —
// leitor de corpo, chave (onRequest), cabeçalhos (onSend), tratador de erros, as três rotas do
// contrato fixo, coringa e tratador 404. A chave roda antes de qualquer leitura de corpo, parâmetro
// ou banco; o corpo chega ao handler como texto, para que JSON malformado e Content-Type errado
// virem 422 (nunca o 400/415 padrão do Fastify). Os handlers só traduzem HTTP ↔ APIs públicas de
// F04 e F05: nenhuma decisão de vaga, nenhum estado, nenhum cache.
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { withTransaction } from '../../db/transaction.js';
import { listEventsOnSale } from '../eventos/public.js';
import { computeAvailableSeats, findTicketById, getSeatAvailabilityForEvents } from '../ingressos/public.js';
import { pathOf, requirePartnerKey } from './auth.js';
import { parsePurchaseBody, PURCHASE_BODY_LIMIT } from './body.js';
import {
  sendPartnerError,
  toPartnerEvent,
  toPartnerTicket,
  toPurchaseAccepted,
  type PartnerEvent,
} from './responses.js';

/** Caminhos que só caem no coringa quando o id passa do limite de parâmetro do roteador (100). */
const LONG_PURCHASE_PATH = /^\/api\/partner\/events\/([^/]+)\/purchases$/;
const LONG_TICKET_PATH = /^\/api\/partner\/tickets\/([^/]+)$/;

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' && Number.isInteger(status) ? status : undefined;
}

/** Texto curto para o log (o id vem do caminho, como o parceiro mandou). */
function loggable(value: unknown): string | undefined {
  return typeof value === 'string' ? value.slice(0, 100) : undefined;
}

/** Segmento do caminho decodificado como o roteador faria (o cru, se a decodificação falhar). */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export async function partnerScope(scope: FastifyInstance): Promise<void> {
  // 1. Corpo: nenhum leitor herdado (JSON, formulário); qualquer Content-Type, inclusive ausente,
  //    chega como texto até 16 KiB. Quem interpreta é o handler da compra (body.ts).
  scope.removeAllContentTypeParsers();
  scope.addContentTypeParser('*', { parseAs: 'string', bodyLimit: PURCHASE_BODY_LIMIT }, (_request, body, done) => {
    done(null, body);
  });

  // 2. Chave antes de tudo (vale para as rotas, o coringa e o tratador 404 do escopo).
  scope.addHook('onRequest', requirePartnerKey(scope.config.partnerApiKey));

  // 3. Status de ingresso nunca vem de cache.
  scope.addHook('onSend', async (_request, reply, payload) => {
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    return payload;
  });

  // 4. Erros: falha na leitura do corpo (4xx do Fastify: limite, tamanho incoerente, Content-Type
  //    ilegível) → 422; qualquer outro → 500.
  scope.setErrorHandler(async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const status = statusOf(error);
    if (status !== undefined && status >= 400 && status < 500) {
      const params = request.params as { eventId?: unknown } | undefined;
      request.log.info({ eventId: loggable(params?.eventId), motivo: 'leitura' }, 'parceiros: corpo da compra inválido');
      return sendPartnerError(reply, 422, 'invalid_request');
    }
    request.log.error({ err: error }, 'parceiros: erro inesperado');
    return sendPartnerError(reply, 500, 'internal_error');
  });

  // GET /api/partner/events (5.3): eventos à venda e vagas num instantâneo único, sem trava.
  async function listEvents(reply: FastifyReply): Promise<FastifyReply> {
    const events = await withTransaction(
      scope.db,
      async (client): Promise<PartnerEvent[]> => {
        const onSale = await listEventsOnSale(client);
        const seats = await getSeatAvailabilityForEvents(client, onSale);
        return onSale.map((event) => toPartnerEvent(event, seats.get(event.id)?.available ?? computeAvailableSeats(event, 0)));
      },
      { isolation: 'repeatable read' },
    );
    return reply.code(200).send(events);
  }

  // POST /api/partner/events/{eventId}/purchases (5.4): 422 → 404 → 409, decididos nesta ordem
  // (corpo aqui; evento e vaga pelo serviço da F05, sob a trava do evento).
  async function purchase(request: FastifyRequest, reply: FastifyReply, eventId: string): Promise<FastifyReply> {
    const body = parsePurchaseBody(request.headers['content-type'], request.body);
    if (!body.ok) {
      request.log.info({ eventId: loggable(eventId), motivo: body.reason }, 'parceiros: corpo da compra inválido');
      return sendPartnerError(reply, 422, 'invalid_request');
    }
    const result = await scope.tickets.purchase({
      eventId,
      buyer: { type: 'email', email: body.buyerEmail },
      cardNumber: body.cardNumber,
      channel: 'api',
    });
    if (result.ok) return reply.code(202).send(toPurchaseAccepted(result.ticket));
    switch (result.reason) {
      case 'event_not_available':
        return sendPartnerError(reply, 404, 'event_not_available');
      case 'sold_out':
        return sendPartnerError(reply, 409, 'sold_out');
      default:
        return sendPartnerError(reply, 422, 'invalid_request');
    }
  }

  // GET /api/partner/tickets/{ticketId} (5.5): ingresso de qualquer canal, só por id.
  async function getTicket(reply: FastifyReply, ticketId: string): Promise<FastifyReply> {
    const ticket = await findTicketById(scope.db, ticketId);
    if (ticket === null) return sendPartnerError(reply, 404, 'ticket_not_found');
    return reply.code(200).send(toPartnerTicket(ticket));
  }

  // 5. As três rotas do contrato fixo (sem esquemas: nenhum 400 automático).
  scope.get('/events', async (_request, reply) => listEvents(reply));
  scope.post<{ Params: { eventId: string } }>('/events/:eventId/purchases', async (request, reply) =>
    purchase(request, reply, request.params.eventId),
  );
  scope.get<{ Params: { ticketId: string } }>('/tickets/:ticketId', async (request, reply) =>
    getTicket(reply, request.params.ticketId),
  );

  // 6. Tudo o mais sob /api/partner (sempre depois da chave). O coringa também recebe os ids acima
  //    do limite de parâmetro do roteador (que, sem ele, responderia 414 antes da chave) e os
  //    entrega aos mesmos handlers; o resto é 404 not_found.
  async function fallback(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const path = pathOf(request.url);
    if (request.method === 'POST') {
      const match = LONG_PURCHASE_PATH.exec(path);
      if (match?.[1] !== undefined) return purchase(request, reply, decodeSegment(match[1]));
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      const match = LONG_TICKET_PATH.exec(path);
      if (match?.[1] !== undefined) return getTicket(reply, decodeSegment(match[1]));
    }
    return sendPartnerError(reply, 404, 'not_found');
  }
  scope.all('/*', fallback);
  scope.setNotFoundHandler(fallback);
}
