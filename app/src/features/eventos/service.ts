// Regras de estado do evento (seções 5.5–5.9 e 5.12.4): cada mudança roda numa transação que
// trava a linha do evento (SELECT … FOR UPDATE) antes de ler vagas ocupadas, comparar e escrever.
import type { FastifyBaseLogger } from 'fastify';
import { newId } from '../../core/ids.js';
import type { Db } from '../../db/pool.js';
import { withTransaction } from '../../db/transaction.js';
import type { EventsExtensionsInternal } from './extensions.js';
import { MESSAGES } from './messages.js';
import {
  insertEvent,
  lockOwnedEventForUpdate,
  markCancelled,
  markPublished,
  updateEventDetails,
  type EventDetails,
} from './repository.js';
import type { EventRecord } from './types.js';

export interface EventServiceContext {
  db: Db;
  extensions: EventsExtensionsInternal;
  log: FastifyBaseLogger;
}

export type EventAction = 'editar' | 'publicar' | 'cancelar';

export type RefusalCode = 'not_found' | 'cancelled' | 'already_published' | 'not_published' | 'below_occupied';

export interface ServiceFailure {
  ok: false;
  code: RefusalCode;
  status: 404 | 409 | 422;
  message: string;
  /** Estado atual do evento (para responder a página de gestão); null em not_found. */
  event: EventRecord | null;
}

export type ServiceResult = { ok: true; event: EventRecord } | ServiceFailure;

function failure(code: RefusalCode, event: EventRecord | null): ServiceFailure {
  switch (code) {
    case 'not_found':
      return { ok: false, code, status: 404, message: '', event: null };
    case 'cancelled':
      return { ok: false, code, status: 409, message: MESSAGES.eventCancelled, event };
    case 'already_published':
      return { ok: false, code, status: 409, message: MESSAGES.alreadyPublished, event };
    case 'not_published':
      return { ok: false, code, status: 409, message: MESSAGES.onlyPublishedCanBeCancelled, event };
    case 'below_occupied':
      return { ok: false, code, status: 422, message: MESSAGES.capacityBelowOccupied, event };
  }
}

/** Recusa por estado (409) da ação sobre o evento, ou null se a ação é permitida no status. */
export function stateRefusal(event: EventRecord, action: EventAction): ServiceFailure | null {
  if (event.status === 'cancelado') return failure('cancelled', event);
  if (action === 'publicar' && event.status === 'publicado') return failure('already_published', event);
  if (action === 'cancelar' && event.status === 'rascunho') return failure('not_published', event);
  return null;
}

export function logRefusal(log: FastifyBaseLogger, eventId: string, action: EventAction, result: ServiceFailure): void {
  log.info({ eventId, action, code: result.code }, 'eventos: ação recusada');
}

function finish(ctx: EventServiceContext, eventId: string, action: EventAction, result: ServiceResult): ServiceResult {
  if (!result.ok) logRefusal(ctx.log, eventId, action, result);
  return result;
}

/** Cria o evento do organizador da sessão; nasce rascunho (padrão da tabela). */
export async function createEvent(ctx: EventServiceContext, organizerId: string, values: EventDetails): Promise<EventRecord> {
  const event = await insertEvent(ctx.db, newId('evt'), organizerId, values);
  ctx.log.info({ eventId: event.id, organizerId }, 'eventos: evento criado');
  return event;
}

/** Edição (5.7): só rascunho e publicado; lotação nunca abaixo das vagas ocupadas (lidas sob a trava). */
export async function updateEvent(
  ctx: EventServiceContext,
  organizerId: string,
  eventId: string,
  values: EventDetails,
): Promise<ServiceResult> {
  const result = await withTransaction(ctx.db, async (client): Promise<ServiceResult> => {
    const event = await lockOwnedEventForUpdate(client, eventId, organizerId);
    if (event === null) return failure('not_found', null);
    const refusal = stateRefusal(event, 'editar');
    if (refusal) return refusal;
    const occupied = await ctx.extensions.occupiedSeats(client, event.id);
    if (values.capacity < occupied) return failure('below_occupied', event);
    const updated = await updateEventDetails(client, event.id, values);
    if (updated === null) throw new Error('eventos: UPDATE da edição não encontrou o evento travado');
    return { ok: true, event: updated };
  });
  if (result.ok) ctx.log.info({ eventId }, 'eventos: evento atualizado');
  return finish(ctx, eventId, 'editar', result);
}

/** Publicação (5.8): rascunho → publicado. */
export async function publishEvent(ctx: EventServiceContext, organizerId: string, eventId: string): Promise<ServiceResult> {
  const result = await withTransaction(ctx.db, async (client): Promise<ServiceResult> => {
    const event = await lockOwnedEventForUpdate(client, eventId, organizerId);
    if (event === null) return failure('not_found', null);
    const refusal = stateRefusal(event, 'publicar');
    if (refusal) return refusal;
    const published = await markPublished(client, event.id);
    if (published === null) throw new Error('eventos: UPDATE da publicação não encontrou o evento travado');
    return { ok: true, event: published };
  });
  if (result.ok) ctx.log.info({ eventId }, 'eventos: evento publicado');
  return finish(ctx, eventId, 'publicar', result);
}

/**
 * Cancelamento (5.9): publicado → cancelado, irreversível. Os tratadores de "evento cancelado"
 * rodam na mesma transação, depois do UPDATE e com a linha travada; erro num deles desfaz tudo.
 */
export async function cancelEvent(ctx: EventServiceContext, organizerId: string, eventId: string): Promise<ServiceResult> {
  let handlerCount = 0;
  const result = await withTransaction(ctx.db, async (client): Promise<ServiceResult> => {
    const event = await lockOwnedEventForUpdate(client, eventId, organizerId);
    if (event === null) return failure('not_found', null);
    const refusal = stateRefusal(event, 'cancelar');
    if (refusal) return refusal;
    const cancelled = await markCancelled(client, event.id);
    if (cancelled === null) throw new Error('eventos: UPDATE do cancelamento não encontrou o evento travado');
    try {
      handlerCount = await ctx.extensions.runCancelledHandlers(cancelled, client);
    } catch (error) {
      ctx.log.error({ eventId, err: error }, 'eventos: falha no tratador de cancelamento');
      throw error;
    }
    return { ok: true, event: cancelled };
  });
  if (result.ok) ctx.log.info({ eventId, handlers: handlerCount }, 'eventos: evento cancelado');
  return finish(ctx, eventId, 'cancelar', result);
}
