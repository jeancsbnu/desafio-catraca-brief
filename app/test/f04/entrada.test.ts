import { describe, expect, it } from 'vitest';
import {
  formatPriceInput,
  formatStartsAtInput,
  parseCapacity,
  parsePriceCents,
  parseStartsAt,
} from '../../src/features/eventos/input.js';
import { MESSAGES } from '../../src/features/eventos/messages.js';
import { readEventForm, validateEventForm, type EventForm } from '../../src/features/eventos/validation.js';

const iso = (text: string): string | null => parseStartsAt(text)?.toISOString() ?? null;

describe('F04 leitura dos campos', () => {
  it('F04-CA01 data em DD/MM/AAAA HH:MM e AAAA-MM-DDTHH:MM é lida no fuso America/Sao_Paulo', () => {
    expect(iso('15/12/2026 21:00')).toBe('2026-12-16T00:00:00.000Z');
    expect(iso('2026-12-15T21:00')).toBe('2026-12-16T00:00:00.000Z');
    expect(iso('2026-12-15 21:00:00')).toBe('2026-12-16T00:00:00.000Z');
    expect(iso('2026-12-15T21:00:30')).toBe('2026-12-16T00:00:30.000Z');
    expect(iso('5/1/2027 9:05')).toBe('2027-01-05T12:05:00.000Z');
    expect(iso('  20/01/2027   20:30 ')).toBe('2027-01-20T23:30:00.000Z');
    expect(iso('29/02/2028 10:00')).toBe('2028-02-29T13:00:00.000Z');
    expect(iso('31/12/2026 23:59')).toBe('2027-01-01T02:59:00.000Z');
  });

  it('data inexistente ou fora do formato é inválida', () => {
    for (const text of [
      '31/02/2027 10:00',
      '29/02/2027 10:00',
      '2027-13-01T10:00',
      '2027-00-10T10:00',
      '00/01/2027 10:00',
      '15/12/2026',
      'amanhã',
      '25:00',
      '15/12/2026 24:00',
      '15/12/2026 21:60',
      '15/12/2026 21:0',
      '2026-12-15T21:00:60',
      '2026-12-15T21:00Z',
      '15-12-2026 21:00',
      '',
    ]) {
      expect(parseStartsAt(text), text).toBeNull();
    }
  });

  it('F04-CA03 preço com vírgula, ponto, sem casas e com R$ vira centavos', () => {
    for (const text of ['100,00', '100.00', '100', 'R$ 100,00', 'R$100', ' 100,0 ']) {
      expect(parsePriceCents(text), text).toEqual({ ok: true, cents: 10000 });
    }
    expect(parsePriceCents('42,5')).toEqual({ ok: true, cents: 4250 });
    expect(parsePriceCents('R$ 42,5')).toEqual({ ok: true, cents: 4250 });
    expect(parsePriceCents('0,01')).toEqual({ ok: true, cents: 1 });
    expect(parsePriceCents('1234,56')).toEqual({ ok: true, cents: 123456 });
  });

  it('F04-CA03 preço zero, negativo, vazio ou texto não é positivo', () => {
    expect(parsePriceCents('0,00')).toEqual({ ok: false, reason: 'nao_positivo' });
    expect(parsePriceCents('0')).toEqual({ ok: false, reason: 'nao_positivo' });
    expect(parsePriceCents('-5')).toEqual({ ok: false, reason: 'nao_positivo' });
    expect(parsePriceCents('-0,01')).toEqual({ ok: false, reason: 'nao_positivo' });
    for (const text of ['', '   ', 'abc', 'R$', '1,', ',5', '1.000,00', '10 00']) {
      expect(parsePriceCents(text), text).toEqual({ ok: false, reason: 'formato' });
    }
    const messages = (preco: string): string[] => {
      const result = validateEventForm({ ...validForm(), preco });
      return result.ok ? [] : result.messages;
    };
    for (const preco of ['0,00', '0', '-5', '', 'abc']) {
      expect(messages(preco), preco).toEqual([MESSAGES.priceInvalid]);
    }
  });

  it('preço com mais de 2 casas ou acima do máximo é rejeitado', () => {
    expect(parsePriceCents('10,999')).toEqual({ ok: false, reason: 'casas' });
    expect(parsePriceCents('1.000')).toEqual({ ok: false, reason: 'casas' });
    expect(parsePriceCents('1000000,01')).toEqual({ ok: false, reason: 'maximo' });
    expect(parsePriceCents('99999999999999999999999')).toEqual({ ok: false, reason: 'maximo' });
    expect(parsePriceCents('1000000,00')).toEqual({ ok: true, cents: 100_000_000 });
    const result = validateEventForm({ ...validForm(), preco: '10,999' });
    expect(result.ok ? [] : result.messages).toEqual([MESSAGES.priceDecimals]);
    const max = validateEventForm({ ...validForm(), preco: '1000000,01' });
    expect(max.ok ? [] : max.messages).toEqual([MESSAGES.priceTooLarge]);
  });

  it('F04-CA03 lotação 0, 1,5, -1 e texto são rejeitadas; 1 e 007 são aceitas', () => {
    for (const text of ['0', '1,5', '1.5', '-1', 'abc', '', '00', '1e3']) {
      expect(parseCapacity(text), text).toEqual({ ok: false, reason: 'invalida' });
    }
    expect(parseCapacity('1000001')).toEqual({ ok: false, reason: 'maximo' });
    expect(parseCapacity('1')).toEqual({ ok: true, value: 1 });
    expect(parseCapacity(' 007 ')).toEqual({ ok: true, value: 7 });
    expect(parseCapacity('1000000')).toEqual({ ok: true, value: 1_000_000 });
    for (const lotacao of ['0', '1,5']) {
      const result = validateEventForm({ ...validForm(), lotacao });
      expect(result.ok ? [] : result.messages, lotacao).toEqual([MESSAGES.capacityInvalid]);
    }
    const max = validateEventForm({ ...validForm(), lotacao: '1000001' });
    expect(max.ok ? [] : max.messages).toEqual([MESSAGES.capacityTooLarge]);
  });

  it('formatos de pré-preenchimento', () => {
    expect(formatPriceInput(15000)).toBe('150,00');
    expect(formatPriceInput(123456)).toBe('1234,56');
    expect(formatPriceInput(1)).toBe('0,01');
    expect(formatPriceInput(4250)).toBe('42,50');
    expect(formatStartsAtInput(new Date('2026-12-16T00:00:00Z'))).toBe('15/12/2026 21:00');
  });
});

function validForm(): EventForm {
  return { nome: 'Show', inicio: '2099-12-15T21:00', local: 'Bar do Centro', lotacao: '2', preco: '100,00' };
}

describe('F04 validação do formulário', () => {
  it('formulário válido produz os valores do evento', () => {
    const result = validateEventForm({ ...validForm(), nome: '  Show  ', local: ' Bar ' });
    expect(result).toEqual({
      ok: true,
      values: {
        name: 'Show',
        startsAt: new Date('2099-12-16T00:00:00Z'),
        location: 'Bar',
        capacity: 2,
        priceCents: 10000,
      },
    });
  });

  it('todas as mensagens, uma por campo, na ordem do formulário', () => {
    const empty = validateEventForm({ nome: '', inicio: '', local: '', lotacao: '', preco: '' });
    expect(empty).toEqual({
      ok: false,
      messages: [
        MESSAGES.nameRequired,
        MESSAGES.startsAtFormat,
        MESSAGES.locationRequired,
        MESSAGES.capacityInvalid,
        MESSAGES.priceInvalid,
      ],
    });
    const long = validateEventForm({
      nome: 'n'.repeat(121),
      inicio: '01/01/2020 10:00',
      local: 'l'.repeat(201),
      lotacao: '2',
      preco: '1',
    });
    expect(long).toEqual({
      ok: false,
      messages: [MESSAGES.nameTooLong, MESSAGES.startsAtPast, MESSAGES.locationTooLong],
    });
  });

  it('F04-CA02 data no passado ou igual ao instante atual é rejeitada', () => {
    const now = new Date('2026-12-16T00:00:00Z');
    const same = validateEventForm({ ...validForm(), inicio: '15/12/2026 21:00' }, now);
    expect(same).toEqual({ ok: false, messages: [MESSAGES.startsAtPast] });
    const after = validateEventForm({ ...validForm(), inicio: '15/12/2026 21:01' }, now);
    expect(after.ok).toBe(true);
  });

  it('nome e local contam pontos de código e recusam caracteres de controle', () => {
    const emoji = '\u{1F3B5}';
    expect(validateEventForm({ ...validForm(), nome: emoji.repeat(120), local: emoji.repeat(200) }).ok).toBe(true);
    const tooLong = validateEventForm({ ...validForm(), nome: emoji.repeat(121) });
    expect(tooLong).toEqual({ ok: false, messages: [MESSAGES.nameTooLong] });
    const control = validateEventForm({ ...validForm(), nome: 'a\u0000b', local: 'x\ny' });
    expect(control).toEqual({ ok: false, messages: [MESSAGES.nameRequired, MESSAGES.locationRequired] });
  });

  it('campo ausente, repetido ou não-texto vale vazio', () => {
    expect(readEventForm(undefined)).toEqual({ nome: '', inicio: '', local: '', lotacao: '', preco: '' });
    expect(readEventForm(null)).toEqual({ nome: '', inicio: '', local: '', lotacao: '', preco: '' });
    expect(readEventForm({ nome: ['a', 'b'], inicio: 5, local: 'Bar', lotacao: '2', extra: 'x' })).toEqual({
      nome: '',
      inicio: '',
      local: 'Bar',
      lotacao: '2',
      preco: '',
    });
  });
});
