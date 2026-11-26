// Tipos do módulo ingressos (F05): o ingresso, a compra, as vagas, o resumo por status e o campo
// que o módulo acrescenta ao Fastify (app.tickets).
import type { Db } from '../../db/pool.js';
import type { EventStatus } from '../eventos/public.js';
import type { GatewaySimulado } from '../gateway/public.js';

/** Status do ingresso (valores da API do brief). checkedIn é informação à parte. */
export type TicketStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'refunded';

export const TICKET_STATUSES: readonly TicketStatus[] = Object.freeze([
  'pending',
  'confirmed',
  'declined',
  'cancelled',
  'refunded',
] as const);

/** Os status que ocupam vaga (R05). */
export const OCCUPYING_STATUSES = ['pending', 'confirmed'] as const;

/** Rótulos exatos do brief. */
export const TICKET_STATUS_LABELS: Readonly<Record<TicketStatus, string>> = Object.freeze({
  pending: 'pendente',
  confirmed: 'confirmado',
  declined: 'recusado',
  cancelled: 'cancelado',
  refunded: 'estornado',
});

/** vitrine: compra com conta de participante (F06); api: compra por e-mail (F07). */
export type TicketChannel = 'vitrine' | 'api';

/** Registro completo de uma linha da tabela tickets. */
export interface TicketRecord {
  /** tkt_ + 16 caracteres [a-z0-9]. */
  id: string;
  /** 8 caracteres A-Z0-9, único no sistema. */
  code: string;
  eventId: string;
  status: TicketStatus;
  checkedIn: boolean;
  checkedInAt: Date | null;
  /** Preço vigente no instante da compra, em centavos (imutável). */
  pricePaidCents: number;
  channel: TicketChannel;
  /** Conta do participante (vitrine); null na API. */
  buyerUserId: string | null;
  /** Em minúsculas (o da conta, na vitrine; o informado, na API). */
  buyerEmail: string;
  createdAt: Date;
  statusChangedAt: Date;
}

export type PurchaseBuyer = { type: 'account'; userId: string } | { type: 'email'; email: string };

export interface PurchaseInput {
  eventId: string;
  buyer: PurchaseBuyer;
  cardNumber: string;
  channel: TicketChannel;
}

/** Valores exatos da API do brief. */
export type PurchaseRejectionReason = 'invalid_request' | 'event_not_available' | 'sold_out';

export type PurchaseResult =
  | { ok: true; ticket: TicketRecord }
  | { ok: false; reason: PurchaseRejectionReason; field?: 'cardNumber' | 'buyer' | 'channel' };

export interface TicketService {
  /** Compra de um ingresso (5.2–5.3): nunca espera o resultado do pagamento. */
  purchase(input: PurchaseInput): Promise<PurchaseResult>;
}

/** O pedaço do logger do Fastify (pino) que o módulo usa. */
export interface TicketLogger {
  info(data: object, message: string): void;
  warn(data: object, message: string): void;
  error(data: object, message: string): void;
}

export interface TicketServiceDeps {
  db: Db;
  gateway: Pick<GatewaySimulado, 'solicitarAutorizacao'>;
  log: TicketLogger;
  /** Gerador do código (só nos testes; padrão generateTicketCode). */
  generateCode?: () => string;
}

export interface SeatAvailability {
  eventId: string;
  eventStatus: EventStatus;
  capacity: number;
  /** pending + confirmed. */
  occupied: number;
  /** 0 em evento cancelado; senão max(0, capacity − occupied). */
  available: number;
}

export interface EventTicketSummary {
  pending: number;
  confirmed: number;
  declined: number;
  cancelled: number;
  refunded: number;
  /** confirmed com checked_in. */
  confirmedCheckedIn: number;
  /** Soma de price_paid_cents dos confirmed. */
  confirmedPaidCents: number;
}

export type CheckInWrite = { updated: true; ticket: TicketRecord } | { updated: false; ticket: TicketRecord | null };

declare module 'fastify' {
  interface FastifyInstance {
    /** Serviço de compra (módulo ingressos, F05): o caminho de F06 e F07. */
    tickets: TicketService;
  }
}
