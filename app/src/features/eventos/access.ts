// Isolamento por dono (R13, seção 5.10): o evento é sempre carregado por id E organizador logado
// numa única consulta; evento alheio, inexistente ou id inválido recebem a mesma página 404.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { currentUser, requireOrganizer } from '../contas/public.js';
import { EVENT_NOT_FOUND_MESSAGE } from './messages.js';
import { notFoundContent } from './pages.js';
import { findOwnedEvent } from './repository.js';
import { EVENT_ID_PATTERN, type EventRecord } from './types.js';

/** Prefixo das rotas de ação sobre um evento (ex.: `${EVENT_ROUTE_PREFIX}/checkin`, F08). */
export const EVENT_ROUTE_PREFIX = '/organizador/eventos/:id';

/** Texto no formato evt_ + 16 caracteres [a-z0-9]. */
export function isEventId(value: unknown): value is string {
  return typeof value === 'string' && EVENT_ID_PATTERN.test(value);
}

/** /organizador/eventos/{id} ou /organizador/eventos/{id}/{action}. */
export function eventManagementPath(eventId: string, action?: string): string {
  const base = `/organizador/eventos/${eventId}`;
  return action === undefined ? base : `${base}/${action}`;
}

/** Responde a página 404 "Evento não encontrado" (sem nenhum dado do evento). */
export async function replyEventNotFound(reply: FastifyReply): Promise<FastifyReply> {
  return reply.page({ title: EVENT_NOT_FOUND_MESSAGE, status: 404, content: notFoundContent() });
}

/**
 * preHandler das rotas com :id: exige organizador (visitante → /entrar; participante → 403) e
 * carrega o evento do organizador logado em request.ownedEvent; senão, a página 404.
 */
export async function requireOwnedEvent(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireOrganizer(request, reply);
  if (reply.sent || request.user?.role !== 'organizador') return;

  const organizerId = currentUser(request).id;
  const id = (request.params as Record<string, unknown> | undefined)?.id;
  const event = isEventId(id) ? await findOwnedEvent(request.server.db, id, organizerId) : null;
  if (event === null) {
    request.log.info({ userId: organizerId }, 'eventos: evento não encontrado para o organizador');
    await replyEventNotFound(reply);
    return;
  }
  request.ownedEvent = event;
}

/** Evento carregado por requireOwnedEvent; sem ele é erro de programação (500). */
export function ownedEvent(request: FastifyRequest): EventRecord {
  const event = request.ownedEvent as EventRecord | null | undefined;
  if (event === null || event === undefined) {
    throw new Error('ownedEvent sem evento: use requireOwnedEvent na rota');
  }
  return event;
}
