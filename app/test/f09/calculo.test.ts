// computePanel (spec 5.3): as definições de R12 sobre o resumo dos ingressos da F05.
import { describe, expect, it } from 'vitest';
import type { EventTicketSummary } from '../../src/features/ingressos/public.js';
import { computePanel } from '../../src/features/painel/metrics.js';

function summary(overrides: Partial<EventTicketSummary> = {}): EventTicketSummary {
  return {
    pending: 0,
    confirmed: 0,
    declined: 0,
    cancelled: 0,
    refunded: 0,
    confirmedCheckedIn: 0,
    confirmedPaidCents: 0,
    ...overrides,
  };
}

describe('F09 cálculo do painel', () => {
  it('F09-CA03 pending conta em Pendentes e ocupa vaga sem entrar na Receita', () => {
    const result = computePanel({ capacity: 3, status: 'publicado' }, summary({ pending: 1 }));
    expect(result).toEqual({ confirmed: 0, pending: 1, checkIns: 0, availableSeats: 2, revenueCents: 0, refunded: 0 });
  });

  it('F09-CA03 declined e cancelled não entram em nenhum número nem ocupam vaga', () => {
    const result = computePanel({ capacity: 4, status: 'publicado' }, summary({ declined: 3, cancelled: 2 }));
    expect(result).toEqual({ confirmed: 0, pending: 0, checkIns: 0, availableSeats: 4, revenueCents: 0, refunded: 0 });
  });

  it('F09-CA05 Check-ins vem dos confirmados com check-in e Confirmados inclui esses ingressos', () => {
    const result = computePanel(
      { capacity: 3, status: 'publicado' },
      summary({ confirmed: 3, confirmedCheckedIn: 1, confirmedPaidCents: 35000 }),
    );
    expect(result).toEqual({ confirmed: 3, pending: 0, checkIns: 1, availableSeats: 0, revenueCents: 35000, refunded: 0 });
  });

  it('F09-CA04 evento cancelado tem Vagas disponíveis 0 e Estornados separado da Receita', () => {
    const result = computePanel({ capacity: 5, status: 'cancelado' }, summary({ refunded: 1, cancelled: 1 }));
    expect(result).toEqual({ confirmed: 0, pending: 0, checkIns: 0, availableSeats: 0, revenueCents: 0, refunded: 1 });
  });

  it('rascunho mostra a lotação em Vagas disponíveis e a lotação excedida nunca dá vaga negativa', () => {
    expect(computePanel({ capacity: 4, status: 'rascunho' }, summary()).availableSeats).toBe(4);
    expect(computePanel({ capacity: 2, status: 'publicado' }, summary({ pending: 2, confirmed: 1 })).availableSeats).toBe(0);
  });

  it('resumo inválido lança erro de programação', () => {
    const event = { capacity: 3, status: 'publicado' } as const;
    const invalid: Partial<EventTicketSummary>[] = [
      { pending: -1 },
      { confirmed: 1.5 },
      { refunded: Number.NaN },
      { confirmedPaidCents: Number.MAX_SAFE_INTEGER + 1 },
      { confirmed: 1, confirmedCheckedIn: 2 },
      { confirmed: '1' as unknown as number },
    ];
    for (const overrides of invalid) {
      expect(() => computePanel(event, summary(overrides)), JSON.stringify(overrides)).toThrow(
        'painel: resumo de ingressos inválido',
      );
    }
  });
});
