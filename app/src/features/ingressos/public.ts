// API pública do módulo ingressos (F05): a única porta de entrada para as outras features (os
// testes podem importar arquivos internos).
//
// - Compra: app.tickets.purchase({ eventId, buyer, cardNumber, channel }) — o mesmo serviço, a mesma
//   trava e as mesmas regras para a vitrine (F06, buyer { type: 'account' }) e a API (F07, buyer
//   { type: 'email' }); createTicketService só para quem roda fora do Fastify (CLI).
// - A tabela tickets pode ser lida por SELECT/JOIN; só a F05 escreve nela (o check-in da F08 usa
//   markTicketCheckedIn).
import './types.js';

export type {
  CheckInWrite,
  EventTicketSummary,
  PurchaseBuyer,
  PurchaseInput,
  PurchaseRejectionReason,
  PurchaseResult,
  SeatAvailability,
  TicketChannel,
  TicketLogger,
  TicketRecord,
  TicketService,
  TicketServiceDeps,
  TicketStatus,
} from './types.js';
export { OCCUPYING_STATUSES, TICKET_STATUS_LABELS, TICKET_STATUSES } from './types.js';
export {
  isTicketCode,
  isTicketId,
  isValidBuyerEmail,
  isValidCardNumber,
  normalizeTicketCode,
} from './validation.js';
export { createTicketService } from './service.js';
export {
  findTicketByCode,
  findTicketById,
  listTicketsByBuyer,
  listTicketsByEvent,
  summarizeEventTickets,
} from './repository.js';
export {
  computeAvailableSeats,
  countOccupiedSeats,
  countOccupiedSeatsByEvent,
  getSeatAvailability,
  getSeatAvailabilityForEvents,
} from './seats.js';
