// Textos do check-in: as mensagens de R10, byte a byte do brief, a do código em branco (PRD F08) e
// os rótulos da seção da página de gestão.
import type { CheckInResult } from './types.js';

export const CHECKIN_MESSAGES: Readonly<Record<CheckInResult, string>> = Object.freeze({
  invalido: 'Ingresso inválido para este evento',
  evento_cancelado: 'Evento cancelado',
  nao_confirmado: 'Ingresso não confirmado',
  ja_utilizado: 'Ingresso já utilizado',
  liberada: 'Entrada liberada',
  codigo_vazio: 'Informe o código do ingresso',
});

export const CHECKIN_TEXTS = Object.freeze({
  title: 'Check-in',
  label: 'Código',
  button: 'Validar',
  checkedCodePrefix: 'Código conferido:',
});
