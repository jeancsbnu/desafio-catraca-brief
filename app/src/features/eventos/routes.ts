// Rotas da área do organizador (seção 5.1). Tudo sob /organizador já passa pelo hook organizerArea
// da F02 (visitante → /entrar; participante → 403) antes de qualquer código daqui.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PageMessage } from '../../core/layout.js';
import { currentUser, requireOrganizer } from '../contas/public.js';
import { EVENT_ROUTE_PREFIX, eventManagementPath, ownedEvent, replyEventNotFound, requireOwnedEvent } from './access.js';
import type { EventsExtensionsInternal } from './extensions.js';
import { successMessageFor, type SuccessCode } from './messages.js';
import { cancelConfirmationContent, EMPTY_FORM, newEventContent, organizerHomeContent } from './pages.js';
import { listEventsByOrganizer } from './repository.js';
import {
  cancelEvent,
  createEvent,
  logRefusal,
  publishEvent,
  stateRefusal,
  updateEvent,
  type EventServiceContext,
  type ServiceFailure,
} from './service.js';
import { readEventForm, validateEventForm, type EventForm } from './validation.js';

function errorMessages(texts: readonly string[]): PageMessage[] {
  return texts.map((text) => ({ kind: 'error', text }));
}

function successPath(eventId: string, code: SuccessCode): string {
  return `${eventManagementPath(eventId)}?ok=${code}`;
}

function bodyField(body: unknown, name: string): string | undefined {
  if (typeof body !== 'object' || body === null || !Object.hasOwn(body, name)) return undefined;
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

export function registerEventRoutes(app: FastifyInstance, extensions: EventsExtensionsInternal): void {
  const contextOf = (request: FastifyRequest): EventServiceContext => ({ db: app.db, extensions, log: request.log });

  /** Recusa (404, 409 ou 422 de vagas): a página 404 ou a página de gestão com a mensagem no topo. */
  async function replyFailure(
    request: FastifyRequest,
    reply: FastifyReply,
    result: ServiceFailure,
    formValues?: EventForm,
  ): Promise<FastifyReply> {
    if (result.event === null) return replyEventNotFound(reply);
    return extensions.renderPage(request, reply, result.event, {
      status: result.status,
      messages: errorMessages([result.message]),
      formValues,
    });
  }

  // 5.3 — lista dos eventos do organizador logado.
  app.get('/organizador', { preHandler: requireOrganizer }, async (request, reply) => {
    const events = await listEventsByOrganizer(app.db, currentUser(request).id);
    return reply.page({ title: 'Área do organizador', content: organizerHomeContent(events) });
  });

  // 5.4 — formulário Novo evento.
  app.get('/organizador/eventos/novo', { preHandler: requireOrganizer }, async (_request, reply) => {
    return reply.page({ title: 'Novo evento', content: newEventContent(EMPTY_FORM) });
  });

  // 5.5 — criação: nasce rascunho, dono sempre da sessão.
  app.post('/organizador/eventos', { preHandler: requireOrganizer }, async (request, reply) => {
    const form = readEventForm(request.body);
    const validation = validateEventForm(form);
    if (!validation.ok) {
      return reply.page({
        title: 'Novo evento',
        status: 422,
        messages: errorMessages(validation.messages),
        content: newEventContent(form),
      });
    }
    const event = await createEvent(contextOf(request), currentUser(request).id, validation.values);
    return reply.redirect(successPath(event.id, 'criado'));
  });

  // 5.6 — página de gestão.
  app.get(EVENT_ROUTE_PREFIX, { preHandler: requireOwnedEvent }, async (request, reply) => {
    const query = request.query as Record<string, unknown> | undefined;
    const success = successMessageFor(query?.ok);
    return extensions.renderPage(request, reply, ownedEvent(request), {
      messages: success === undefined ? [] : [{ kind: 'success', text: success }],
    });
  });

  // 5.7 — edição: dono (404) → status (409) → campos (422) → vagas ocupadas sob a trava (422).
  app.post(`${EVENT_ROUTE_PREFIX}/editar`, { preHandler: requireOwnedEvent }, async (request, reply) => {
    const event = ownedEvent(request);
    const refusal = stateRefusal(event, 'editar');
    if (refusal) {
      logRefusal(request.log, event.id, 'editar', refusal);
      return replyFailure(request, reply, refusal);
    }
    const form = readEventForm(request.body);
    const validation = validateEventForm(form);
    if (!validation.ok) {
      return extensions.renderPage(request, reply, event, {
        status: 422,
        messages: errorMessages(validation.messages),
        formValues: form,
      });
    }
    const result = await updateEvent(contextOf(request), currentUser(request).id, event.id, validation.values);
    if (!result.ok) return replyFailure(request, reply, result, form);
    return reply.redirect(successPath(event.id, 'atualizado'));
  });

  // 5.8 — publicação.
  app.post(`${EVENT_ROUTE_PREFIX}/publicar`, { preHandler: requireOwnedEvent }, async (request, reply) => {
    const event = ownedEvent(request);
    const result = await publishEvent(contextOf(request), currentUser(request).id, event.id);
    if (!result.ok) return replyFailure(request, reply, result);
    return reply.redirect(successPath(event.id, 'publicado'));
  });

  // 5.9 — cancelamento: confirmação (GET, ou POST sem confirmar=sim) e execução.
  async function cancel(request: FastifyRequest, reply: FastifyReply, confirmed: boolean): Promise<FastifyReply> {
    const event = ownedEvent(request);
    const refusal = stateRefusal(event, 'cancelar');
    if (refusal) {
      logRefusal(request.log, event.id, 'cancelar', refusal);
      return replyFailure(request, reply, refusal);
    }
    if (!confirmed) {
      return reply.page({ title: 'Cancelar evento', content: cancelConfirmationContent(event) });
    }
    const result = await cancelEvent(contextOf(request), currentUser(request).id, event.id);
    if (!result.ok) return replyFailure(request, reply, result);
    return reply.redirect(successPath(event.id, 'cancelado'));
  }

  app.get(`${EVENT_ROUTE_PREFIX}/cancelar`, { preHandler: requireOwnedEvent }, async (request, reply) =>
    cancel(request, reply, false),
  );

  app.post(`${EVENT_ROUTE_PREFIX}/cancelar`, { preHandler: requireOwnedEvent }, async (request, reply) =>
    cancel(request, reply, bodyField(request.body, 'confirmar') === 'sim'),
  );
}
