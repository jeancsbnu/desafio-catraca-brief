// Formatos da API de parceiros (spec 5.3–5.6): códigos de erro do brief e os três corpos de sucesso,
// montados à mão com as chaves na ordem do brief (sem esquema de resposta, sem campos a mais).
import type { FastifyReply } from 'fastify';
import { toIsoWithOffset } from '../../core/format.js';
import type { EventRecord } from '../eventos/public.js';
import type { TicketRecord, TicketStatus } from '../ingressos/public.js';

/** Valores exatos do brief (mais not_found e internal_error, os corpos de API da F01). */
export type PartnerErrorCode =
  | 'unauthorized'
  | 'invalid_request'
  | 'event_not_available'
  | 'sold_out'
  | 'ticket_not_found'
  | 'not_found'
  | 'internal_error';

export interface PartnerErrorBody {
  error: PartnerErrorCode;
}

/** Elemento de GET /api/partner/events. */
export interface PartnerEvent {
  id: string;
  name: string;
  /** ISO 8601 com segundos e offset do fuso do produto (ex.: 2026-12-05T21:00:00-03:00). */
  startsAt: string;
  priceCents: number;
  availableSeats: number;
}

/** Corpo do 202 de POST /api/partner/events/{eventId}/purchases. */
export interface PurchaseAccepted {
  ticketId: string;
  code: string;
  status: TicketStatus;
}

/** Corpo do 200 de GET /api/partner/tickets/{ticketId}. */
export interface PartnerTicket {
  ticketId: string;
  code: string;
  eventId: string;
  status: TicketStatus;
  checkedIn: boolean;
}

/** Responde {"error":"<code>"} com o status dado (JSON; o onSend do escopo põe o cache-control). */
export function sendPartnerError(reply: FastifyReply, status: number, code: PartnerErrorCode): FastifyReply {
  const body: PartnerErrorBody = { error: code };
  return reply.code(status).send(body);
}

export function toPartnerEvent(event: Pick<EventRecord, 'id' | 'name' | 'startsAt' | 'priceCents'>, availableSeats: number): PartnerEvent {
  return {
    id: event.id,
    name: event.name,
    startsAt: toIsoWithOffset(event.startsAt),
    priceCents: event.priceCents,
    availableSeats,
  };
}

export function toPurchaseAccepted(ticket: Pick<TicketRecord, 'id' | 'code' | 'status'>): PurchaseAccepted {
  return { ticketId: ticket.id, code: ticket.code, status: ticket.status };
}

export function toPartnerTicket(ticket: Pick<TicketRecord, 'id' | 'code' | 'eventId' | 'status' | 'checkedIn'>): PartnerTicket {
  return {
    ticketId: ticket.id,
    code: ticket.code,
    eventId: ticket.eventId,
    status: ticket.status,
    checkedIn: ticket.checkedIn,
  };
}
