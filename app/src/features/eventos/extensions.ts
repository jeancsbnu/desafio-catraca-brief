// Pontos de extensão do módulo eventos (seção 5.12), por instância da aplicação: seções da página
// de gestão, provedor de vagas ocupadas, tratadores de "evento cancelado" e a renderização da
// página de gestão. Os registros congelam quando a aplicação fica pronta (onReady).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbClient } from '../../db/pool.js';
import { formValuesOf, managementContent, type RenderedSection } from './pages.js';
import type {
  EventCancelledHandler,
  EventRecord,
  EventsExtensions,
  ManagementPageOptions,
  ManagementSection,
  OccupiedSeatsProvider,
} from './types.js';
import type { EventForm } from './validation.js';

export interface InternalManagementPageOptions extends ManagementPageOptions {
  /** Valores do formulário de edição (padrão: os guardados no evento). */
  formValues?: EventForm;
}

/** O objeto completo, usado pelo próprio módulo; app.events expõe só a parte pública. */
export interface EventsExtensionsInternal extends EventsExtensions {
  renderPage(
    request: FastifyRequest,
    reply: FastifyReply,
    event: EventRecord,
    options?: InternalManagementPageOptions,
  ): Promise<FastifyReply>;
  /** Chama os tratadores em sequência, na ordem de registro; devolve quantos foram chamados. */
  runCancelledHandlers(event: EventRecord, client: DbClient): Promise<number>;
  /** Seções na ordem de exibição (order crescente; empate pela ordem de registro). */
  sections(): readonly ManagementSection[];
  freeze(): void;
  /** Só a API pública (o valor de app.events). */
  publicApi(): EventsExtensions;
}

const SECTION_NAME = /^[a-z][a-z0-9-]*$/;
const RESERVED_SECTION_NAMES: ReadonlySet<string> = new Set(['edicao']);
const LATE_REGISTRATION = 'eventos: registro de extensão depois de a aplicação ficar pronta';

export function createEventsExtensions(app: FastifyInstance): EventsExtensionsInternal {
  let frozen = false;
  let provider: OccupiedSeatsProvider | null = null;
  const handlers: EventCancelledHandler[] = [];
  const registered: ManagementSection[] = [];

  function assertOpen(): void {
    if (frozen) throw new Error(LATE_REGISTRATION);
  }

  function sections(): readonly ManagementSection[] {
    return registered
      .map((section, index) => ({ section, index }))
      .sort((a, b) => a.section.order - b.section.order || a.index - b.index)
      .map(({ section }) => section);
  }

  async function renderPage(
    request: FastifyRequest,
    reply: FastifyReply,
    event: EventRecord,
    options: InternalManagementPageOptions = {},
  ): Promise<FastifyReply> {
    const organizer = request.user ?? null;
    if (organizer === null || event.organizerId !== organizer.id) {
      throw new Error('eventos: renderManagementPage com evento que não é do organizador logado (use ownedEvent(request))');
    }
    const rendered: RenderedSection[] = [];
    for (const section of sections()) {
      const states = options.sectionState;
      const state = states !== undefined && Object.hasOwn(states, section.name) ? states[section.name] : undefined;
      rendered.push({ name: section.name, html: await section.render({ request, event, organizer, db: app.db, state }) });
    }
    return reply.page({
      title: event.name,
      status: options.status ?? 200,
      messages: options.messages ?? [],
      content: managementContent(event, { formValues: options.formValues ?? formValuesOf(event), sections: rendered }),
    });
  }

  const api: EventsExtensions = {
    setOccupiedSeatsProvider(next: OccupiedSeatsProvider): void {
      assertOpen();
      if (typeof next !== 'function') throw new Error('eventos: o provedor de vagas ocupadas precisa ser uma função');
      if (provider !== null) throw new Error('eventos: provedor de vagas ocupadas já registrado');
      provider = next;
    },

    onEventCancelled(handler: EventCancelledHandler): void {
      assertOpen();
      if (typeof handler !== 'function') throw new Error('eventos: o tratador de evento cancelado precisa ser uma função');
      handlers.push(handler);
    },

    addManagementSection(section: ManagementSection): void {
      assertOpen();
      const name: unknown = section?.name;
      if (typeof name !== 'string' || !SECTION_NAME.test(name)) {
        throw new Error(`eventos: nome de seção inválido: ${String(name)} (use [a-z][a-z0-9-]*)`);
      }
      if (RESERVED_SECTION_NAMES.has(name)) throw new Error(`eventos: nome de seção reservado: ${name}`);
      if (registered.some((existing) => existing.name === name)) throw new Error(`eventos: seção repetida: ${name}`);
      if (typeof section.order !== 'number' || !Number.isFinite(section.order)) {
        throw new Error(`eventos: a seção ${name} precisa de order numérico`);
      }
      if (typeof section.render !== 'function') throw new Error(`eventos: a seção ${name} precisa de render`);
      registered.push({ name, order: section.order, render: section.render.bind(section) });
    },

    renderManagementPage(request, reply, event, options = {}) {
      return renderPage(request, reply, event, {
        status: options.status,
        messages: options.messages,
        sectionState: options.sectionState,
      });
    },

    async occupiedSeats(client: DbClient, eventId: string): Promise<number> {
      if (provider === null) return 0;
      const occupied: unknown = await provider(client, eventId);
      if (typeof occupied !== 'number' || !Number.isSafeInteger(occupied) || occupied < 0) {
        throw new Error(`eventos: o provedor de vagas ocupadas devolveu um valor inválido: ${String(occupied)}`);
      }
      return occupied;
    },
  };

  return {
    ...api,
    renderPage,
    sections,
    async runCancelledHandlers(event: EventRecord, client: DbClient): Promise<number> {
      for (const handler of handlers) {
        await handler(event, client);
      }
      return handlers.length;
    },
    freeze(): void {
      frozen = true;
    },
    publicApi(): EventsExtensions {
      return api;
    },
  };
}
