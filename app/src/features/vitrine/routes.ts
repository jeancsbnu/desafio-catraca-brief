// Rotas da vitrine (spec 5.1–5.3): GET / e GET /eventos/:id. Só APIs públicas de F02, F04 e F05,
// sem SQL próprio: a mesma definição de "à venda" e as mesmas vagas da API de parceiros (F07).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PageMessage } from '../../core/layout.js';
import { EVENT_NOT_FOUND_MESSAGE, findEventById, isEventId, isOnSale, listEventsOnSale, type EventRecord } from '../eventos/public.js';
import { getSeatAvailability, getSeatAvailabilityForEvents } from '../ingressos/public.js';
import { SHOWCASE_TITLE } from './messages.js';
import { eventNotFoundContent, eventPageContent, showcaseContent } from './pages.js';
import { purchaseBlockKind } from './purchase.js';

type EventParams = { Params: { id: string } };

/** Página 404 "Evento não encontrado" da vitrine (as duas rotas do evento). */
export async function replyShowcaseEventNotFound(reply: FastifyReply): Promise<FastifyReply> {
  return reply.page({ title: EVENT_NOT_FOUND_MESSAGE, status: 404, content: eventNotFoundContent() });
}

/** O evento, se o id tiver o formato e o evento estiver à venda (F04); senão null. */
export async function findEventOnSale(app: FastifyInstance, id: unknown): Promise<EventRecord | null> {
  if (!isEventId(id)) return null;
  const event = await findEventById(app.db, id);
  return event !== null && isOnSale(event) ? event : null;
}

/** Vagas disponíveis do instante (F05; leitura sem trava). */
async function availableSeats(app: FastifyInstance, eventId: string): Promise<number> {
  return (await getSeatAvailability(app.db, eventId))?.available ?? 0;
}

export interface EventPageOptions {
  status?: number;
  messages?: readonly PageMessage[];
}

/** Página do evento com as vagas do instante e o bloco de compra de quem olha. */
export async function replyEventPage(
  request: FastifyRequest,
  reply: FastifyReply,
  event: EventRecord,
  options: EventPageOptions = {},
): Promise<FastifyReply> {
  const available = await availableSeats(request.server, event.id);
  const kind = purchaseBlockKind(request.user, available);
  return reply.page({
    title: event.name,
    status: options.status ?? 200,
    messages: options.messages ?? [],
    content: eventPageContent(event, available, kind),
  });
}

export function registerShowcaseRoutes(app: FastifyInstance): void {
  // Vitrine: eventos à venda de todos os organizadores, por data de início, com as vagas do instante.
  app.get('/', async (_request, reply) => {
    const events = await listEventsOnSale(app.db);
    const seats = await getSeatAvailabilityForEvents(app.db, events);
    const rows = events.map((event) => ({ event, available: seats.get(event.id)?.available ?? event.capacity }));
    return reply.page({ title: SHOWCASE_TITLE, content: showcaseContent(rows) });
  });

  // Página pública do evento: 404 idêntico para rascunho, cancelado, inexistente e id inválido.
  app.get<EventParams>('/eventos/:id', async (request, reply) => {
    const event = await findEventOnSale(app, request.params.id);
    if (event === null) return replyShowcaseEventNotFound(reply);
    return replyEventPage(request, reply, event);
  });
}
