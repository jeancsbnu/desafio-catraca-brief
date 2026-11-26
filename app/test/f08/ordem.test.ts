// A ordem de R10 (decideCheckIn, função pura) em matriz e as mensagens exatas (spec 5.3).
import { describe, expect, it } from 'vitest';
import { CHECKIN_MESSAGES, decideCheckIn } from '../../src/features/checkin/public.js';
import type { EventStatus } from '../../src/features/eventos/public.js';
import { TICKET_STATUSES, type TicketStatus } from '../../src/features/ingressos/public.js';

const EVENT_ID = 'evt_aaaaaaaaaaaaaaaa';
const OTHER_EVENT_ID = 'evt_bbbbbbbbbbbbbbbb';
const EVENT_STATUSES: readonly EventStatus[] = ['rascunho', 'publicado', 'cancelado'];

const event = (status: EventStatus) => ({ id: EVENT_ID, status });
const ticket = (status: TicketStatus, checkedIn = false, eventId = EVENT_ID) => ({ eventId, status, checkedIn });

describe('F08 ordem de R10', () => {
  it('F08-CA05 código inexistente ou de outro evento é inválido em qualquer status do evento', () => {
    for (const eventStatus of EVENT_STATUSES) {
      expect(decideCheckIn(event(eventStatus), null)).toBe('invalido');
      for (const status of TICKET_STATUSES) {
        for (const checkedIn of [false, true]) {
          expect(decideCheckIn(event(eventStatus), ticket(status, checkedIn, OTHER_EVENT_ID)), `${eventStatus} ${status} ${checkedIn}`).toBe(
            'invalido',
          );
        }
      }
    }
  });

  it('F08-CA06 evento cancelado vem antes de não confirmado e de já utilizado', () => {
    for (const status of TICKET_STATUSES) {
      for (const checkedIn of [false, true]) {
        expect(decideCheckIn(event('cancelado'), ticket(status, checkedIn)), `${status} ${checkedIn}`).toBe('evento_cancelado');
      }
    }
  });

  it('F08-CA04 pending, declined, cancelled e refunded em evento publicado são não confirmados', () => {
    for (const status of ['pending', 'declined', 'cancelled', 'refunded'] as const) {
      expect(decideCheckIn(event('publicado'), ticket(status)), status).toBe('nao_confirmado');
    }
    // 3 antes de 4: estornado que passou pelo check-in, num evento não cancelado (dado incoerente).
    expect(decideCheckIn(event('publicado'), ticket('refunded', true))).toBe('nao_confirmado');
  });

  it('F08-CA03 confirmado com check-in é já utilizado', () => {
    expect(decideCheckIn(event('publicado'), ticket('confirmed', true))).toBe('ja_utilizado');
  });

  it('F08-CA02 confirmado sem check-in em evento publicado é liberado', () => {
    expect(decideCheckIn(event('publicado'), ticket('confirmed', false))).toBe('liberada');
  });

  it('as mensagens são as do brief, byte a byte', () => {
    // Escapes Unicode: as letras acentuadas são os caracteres compostos (NFC) do brief.
    const expected = {
      invalido: 'Ingresso inválido para este evento',
      evento_cancelado: 'Evento cancelado',
      nao_confirmado: 'Ingresso não confirmado',
      ja_utilizado: 'Ingresso já utilizado',
      liberada: 'Entrada liberada',
      codigo_vazio: 'Informe o código do ingresso',
    };
    expect(Object.keys(CHECKIN_MESSAGES).sort()).toEqual(Object.keys(expected).sort());
    for (const [key, text] of Object.entries(expected)) {
      const actual = CHECKIN_MESSAGES[key as keyof typeof expected];
      expect(Buffer.from(actual, 'utf8').equals(Buffer.from(text, 'utf8')), key).toBe(true);
    }
    expect(Buffer.from(CHECKIN_MESSAGES.invalido, 'utf8').toString('hex')).toBe(
      Buffer.from('Ingresso inválido para este evento', 'utf8').toString('hex'),
    );
    expect(Object.isFrozen(CHECKIN_MESSAGES)).toBe(true);
  });
});
