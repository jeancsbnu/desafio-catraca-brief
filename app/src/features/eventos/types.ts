// Tipos do módulo eventos (F04): o registro do evento, os pontos de extensão que F05, F08 e F09
// usam e os campos que o módulo acrescenta ao Fastify (app.events e request.ownedEvent).
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SafeHtml } from '../../core/html.js';
import type { PageMessage } from '../../core/layout.js';
import type { Db, DbClient } from '../../db/pool.js';
import type { SessionUser } from '../contas/public.js';

export type EventStatus = 'rascunho' | 'publicado' | 'cancelado';

/** Registro completo de uma linha da tabela events. */
export interface EventRecord {
  /** evt_ + 16 caracteres [a-z0-9]. */
  id: string;
  organizerId: string;
  name: string;
  startsAt: Date;
  location: string;
  capacity: number;
  /** Preço vigente em centavos (a compra, F05, grava o valor pago no momento). */
  priceCents: number;
  status: EventStatus;
  publishedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const EVENT_STATUS_LABELS: Readonly<Record<EventStatus, string>> = Object.freeze({
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  cancelado: 'Cancelado',
});

/** Formato do id do evento (newId('evt')). */
export const EVENT_ID_PATTERN = /^evt_[a-z0-9]{16}$/;

/** A única definição de "à venda" (vitrine, API e compra): status publicado (e não cancelado). */
export function isOnSale(event: Pick<EventRecord, 'status'>): boolean {
  return event.status === 'publicado';
}

/**
 * Vagas ocupadas do evento (F05: pendentes + confirmados), para a validação de lotação mínima.
 * Chamado com o client da transação da edição, com a linha do evento já travada.
 */
export type OccupiedSeatsProvider = (client: DbClient, eventId: string) => Promise<number>;

/**
 * Tratador do evento de domínio "evento cancelado" (F05). Roda dentro da transação do
 * cancelamento, depois do UPDATE de status e com a linha do evento travada; todas as escritas
 * usam o client recebido. Lançar erro desfaz o cancelamento inteiro.
 */
export type EventCancelledHandler = (event: EventRecord, client: DbClient) => Promise<void>;

export interface ManagementSectionContext {
  request: FastifyRequest;
  /** Já verificado como do organizador logado. */
  event: EventRecord;
  organizer: SessionUser;
  db: Db;
  /** options.sectionState?.[section.name] da renderManagementPage (undefined no GET da página). */
  state: unknown;
}

/** Seção acrescentada à página de gestão por outra feature (F08 check-in, F09 painel). */
export interface ManagementSection {
  /** Único; [a-z][a-z0-9-]*; 'edicao' é reservado. */
  name: string;
  /** Menor aparece antes (sugestão: checkin 100, painel 200); empate pela ordem de registro. */
  order: number;
  render(context: ManagementSectionContext): SafeHtml | Promise<SafeHtml>;
}

export interface ManagementPageOptions {
  /** Padrão 200. */
  status?: number;
  /** Mensagens no topo da página ("em destaque"). */
  messages?: readonly PageMessage[];
  /** Estado repassado a cada seção pelo nome. */
  sectionState?: Readonly<Record<string, unknown>>;
}

export interface EventsExtensions {
  /** Um único provedor por aplicação (o segundo registro lança Error). Sem provedor = 0 vagas. */
  setOccupiedSeatsProvider(provider: OccupiedSeatsProvider): void;
  /** Vários tratadores, chamados em sequência, na ordem de registro. */
  onEventCancelled(handler: EventCancelledHandler): void;
  addManagementSection(section: ManagementSection): void;
  /** Responde a página de gestão (5.6) com mensagens no topo e o estado por seção. */
  renderManagementPage(
    request: FastifyRequest,
    reply: FastifyReply,
    event: EventRecord,
    options?: ManagementPageOptions,
  ): Promise<FastifyReply>;
  /** Uso interno da F04 (validação da lotação mínima sob a trava). */
  occupiedSeats(client: DbClient, eventId: string): Promise<number>;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Pontos de extensão do módulo eventos (F04). */
    events: EventsExtensions;
  }

  interface FastifyRequest {
    /** Evento do organizador logado, preenchido por requireOwnedEvent; null nas demais rotas. */
    ownedEvent: EventRecord | null;
  }
}
