// API pública do módulo eventos (F04): a única porta de entrada para as outras features (os testes
// podem importar arquivos internos).
//
// - "À venda" tem uma única definição: isOnSale / listEventsOnSale (status publicado).
// - Quem cria ou altera ingressos que ocupam vaga trava antes a linha do evento com
//   lockEventForUpdate, dentro de withTransaction (protocolo de trava, spec 5.12.4).
// - Pontos de extensão em app.events (registrar só no registro do plugin, loadOrder > 30):
//   setOccupiedSeatsProvider, onEventCancelled, addManagementSection, renderManagementPage.
// - Rotas de ação: app.post(`${EVENT_ROUTE_PREFIX}/<acao>`, { preHandler: requireOwnedEvent }, …)
//   e o evento por ownedEvent(request).
import './types.js';

export type {
  EventCancelledHandler,
  EventRecord,
  EventsExtensions,
  EventStatus,
  ManagementPageOptions,
  ManagementSection,
  ManagementSectionContext,
  OccupiedSeatsProvider,
} from './types.js';
export { EVENT_STATUS_LABELS, isOnSale } from './types.js';
export { EVENT_NOT_FOUND_MESSAGE } from './messages.js';
export { findEventById, findEventsByIds, listEventsOnSale, lockEventForUpdate } from './repository.js';
export {
  EVENT_ROUTE_PREFIX,
  eventManagementPath,
  isEventId,
  ownedEvent,
  replyEventNotFound,
  requireOwnedEvent,
} from './access.js';
