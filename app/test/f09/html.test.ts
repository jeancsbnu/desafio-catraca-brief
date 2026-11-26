// HTML da seção "Painel" (spec 5.2, 5.5 e 5.6).
import { describe, expect, it } from 'vitest';
import type { EventPanel } from '../../src/features/painel/types.js';
import { panelContent, panelUnavailableContent } from '../../src/features/painel/view.js';

// Espaços especiais (U+00A0, U+202F etc.): a receita usa só o espaço comum (U+0020).
const SPECIAL_SPACES = new Set([
  0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x200b, 0x202f,
  0x205f, 0x3000, 0xfeff,
]);
const hasSpecialSpace = (text: string): boolean =>
  [...text].some((char) => SPECIAL_SPACES.has(char.codePointAt(0) ?? 0));

function panel(overrides: Partial<EventPanel> = {}): EventPanel {
  return { confirmed: 0, pending: 0, checkIns: 0, availableSeats: 0, revenueCents: 0, refunded: 0, ...overrides };
}

describe('F09 HTML do painel', () => {
  it('F09-CA01 a seção tem o título Painel e os seis rótulos na ordem, cada valor com data-metrica', () => {
    const content = panelContent(
      panel({ confirmed: 3, pending: 1, checkIns: 2, availableSeats: 4, revenueCents: 35000, refunded: 5 }),
    ).value;
    expect(content.split('\n')).toEqual([
      '<h2>Painel</h2>',
      '<dl>',
      '<dt>Confirmados</dt><dd data-metrica="confirmados">3</dd>',
      '<dt>Pendentes</dt><dd data-metrica="pendentes">1</dd>',
      '<dt>Check-ins</dt><dd data-metrica="check-ins">2</dd>',
      '<dt>Vagas disponíveis</dt><dd data-metrica="vagas-disponiveis">4</dd>',
      '<dt>Receita</dt><dd data-metrica="receita" data-centavos="35000">R$ 350,00</dd>',
      '<dt>Estornados</dt><dd data-metrica="estornados">5</dd>',
      '</dl>',
      '<p>Números do momento em que a página foi aberta. Recarregue para atualizar.</p>',
    ]);
  });

  it('F09-CA02 a Receita sai como R$ 0,00, R$ 350,00, R$ 1.234,56 e R$ 1.234.567,90 com espaço comum e data-centavos', () => {
    const cases: [number, string][] = [
      [0, 'R$ 0,00'],
      [35000, 'R$ 350,00'],
      [123456, 'R$ 1.234,56'],
      [123456790, 'R$ 1.234.567,90'],
    ];
    for (const [cents, text] of cases) {
      const content = panelContent(panel({ confirmed: 1, revenueCents: cents })).value;
      expect(content).toContain(`<dt>Receita</dt><dd data-metrica="receita" data-centavos="${cents}">${text}</dd>`);
      expect(content).toContain('R$ ');
      expect(hasSpecialSpace(content), String(cents)).toBe(false);
      expect(content.split('data-centavos=').length - 1).toBe(1);
    }
  });

  it('contagens saem como inteiros sem separador de milhar', () => {
    const content = panelContent(
      panel({ confirmed: 1000, pending: 2000, checkIns: 1000, availableSeats: 12345, refunded: 1000 }),
    ).value;
    expect(content).toContain('<dd data-metrica="confirmados">1000</dd>');
    expect(content).toContain('<dd data-metrica="pendentes">2000</dd>');
    expect(content).toContain('<dd data-metrica="check-ins">1000</dd>');
    expect(content).toContain('<dd data-metrica="vagas-disponiveis">12345</dd>');
    expect(content).toContain('<dd data-metrica="estornados">1000</dd>');
    expect(content).not.toMatch(/>\d{1,3}\.\d{3}</);
  });

  it('a seção indisponível não mostra números', () => {
    const content = panelUnavailableContent().value;
    expect(content).toBe('<h2>Painel</h2>\n<p>Painel indisponível no momento. Recarregue a página.</p>');
    expect(content).not.toContain('<dl>');
    expect(content).not.toContain('data-metrica');
    expect(content.replace(/<[^>]*>/g, '')).not.toMatch(/\d/);
  });
});
