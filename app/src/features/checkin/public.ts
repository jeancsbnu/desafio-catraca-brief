// API pública do módulo checkin (F08): a única porta de entrada para as outras features (F09) e
// para os testes de outras features.
//
// - A marcação (tickets.checked_in / checked_in_at, colunas da F05) só é escrita pelo check-in
//   liberado, via markTicketCheckedIn da F05, com a linha do evento travada.
// - checkInTicket não confere o dono do evento: a rota usa requireOwnedEvent (F04) antes.
export type { CheckInDecision, CheckInOutcome, CheckInResult, CheckInSectionState } from './types.js';
export { CHECKIN_MESSAGES } from './messages.js';
export { checkInTicket, decideCheckIn, normalizeTypedCode, readTypedCode } from './service.js';
