// API pública do módulo eventos (F04): a única porta de entrada para as outras features.
import './types.js';

export type { EventRecord, EventStatus } from './types.js';
export { EVENT_STATUS_LABELS, isOnSale } from './types.js';
export { findEventById, findEventsByIds, listEventsOnSale, lockEventForUpdate } from './repository.js';
