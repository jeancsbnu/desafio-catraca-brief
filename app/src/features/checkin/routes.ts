// Rotas do check-in (spec 5.1, 5.6, 5.8). Ficam sob /organizador (hooks da F02 antes de tudo) e
// passam pelo guarda de dono da F04: evento alheio, inexistente ou id inválido → 404 sem ler o código.
import type { FastifyInstance } from 'fastify';
import { EVENT_ROUTE_PREFIX, eventManagementPath, ownedEvent, requireOwnedEvent } from '../eventos/public.js';
import { CHECKIN_SECTION_NAME } from './section.js';
import { checkInTicket, readTypedCode } from './service.js';
import type { CheckInSectionState } from './types.js';

export function registerCheckInRoutes(app: FastifyInstance): void {
  // Ação: aplica a lista de R10 e responde a página de gestão (depois do commit) com o resultado.
  app.post(`${EVENT_ROUTE_PREFIX}/checkin`, { preHandler: requireOwnedEvent }, async (request, reply) => {
    const event = ownedEvent(request);
    const outcome = await checkInTicket(app.db, event.id, readTypedCode(request.body));

    // Nunca o texto digitado nem o código do ingresso (o código é a credencial de entrada).
    if (outcome.result === 'liberada') {
      request.log.info({ eventId: event.id, ticketId: outcome.ticket?.id ?? null }, 'checkin: entrada liberada');
    } else {
      request.log.info(
        { eventId: event.id, resultado: outcome.result, ticketId: outcome.ticket?.id ?? null },
        'checkin: entrada recusada',
      );
    }

    const state: CheckInSectionState = { result: outcome.result, message: outcome.message, code: outcome.code };
    return app.events.renderManagementPage(request, reply, outcome.event ?? event, {
      status: outcome.result === 'codigo_vazio' ? 422 : 200,
      sectionState: { [CHECKIN_SECTION_NAME]: state },
    });
  });

  // Endereço da ação aberto direto (ou favoritado): volta para a página de gestão.
  app.get(`${EVENT_ROUTE_PREFIX}/checkin`, { preHandler: requireOwnedEvent }, async (request, reply) =>
    reply.redirect(eventManagementPath(ownedEvent(request).id)),
  );
}
