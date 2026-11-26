// Tipos do módulo checkin (F08): o resultado do check-in (a situação de R10 ou o código em branco),
// a saída do serviço e o estado que a rota passa à seção da página de gestão.
import type { EventRecord } from '../eventos/public.js';
import type { TicketRecord } from '../ingressos/public.js';

/** As cinco situações de R10 e o código em branco (decidido antes da lista). */
export type CheckInResult = 'liberada' | 'ja_utilizado' | 'nao_confirmado' | 'evento_cancelado' | 'invalido' | 'codigo_vazio';

/** As cinco situações de R10 (resultado de decideCheckIn). */
export type CheckInDecision = Exclude<CheckInResult, 'codigo_vazio'>;

export interface CheckInOutcome {
  result: CheckInResult;
  /** CHECKIN_MESSAGES[result]. */
  message: string;
  /** Código normalizado (8 caracteres A-Z0-9); null no código em branco ou sem formato de código. */
  code: string | null;
  /** O ingresso, só quando ele é deste evento (situações 2–5); null na situação 1 e no código em branco. */
  ticket: TicketRecord | null;
  /** O evento lido sob a trava; null no código em branco (nenhuma consulta). */
  event: EventRecord | null;
}

/** Estado passado à seção checkin pela resposta do POST (sectionState.checkin). */
export interface CheckInSectionState {
  result: CheckInResult;
  message: string;
  code: string | null;
}
