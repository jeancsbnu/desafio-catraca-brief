import { describe, expect, it, vi } from 'vitest';
import {
  FAIXA_LENTA_MS,
  FAIXA_RAPIDA_MS,
  finalDoCartao,
  regraPorFinal,
  sortearResposta,
  type SortearInteiro,
} from '../../src/features/gateway/tabela.js';

const minimo: SortearInteiro = (min) => min;
const maximo: SortearInteiro = (_min, max) => max;

function confereFaixa(cartao: string, resultado: string, faixa: readonly [number, number]): void {
  const sortear = vi.fn<SortearInteiro>((min) => min);
  const resposta = sortearResposta(cartao, { sortearInteiro: sortear });
  expect(resposta.resultado).toBe(resultado);
  expect(resposta.finalCartao).toBe(cartao.slice(-4));
  expect(sortear).toHaveBeenCalledWith(faixa[0], faixa[1]);
  expect(sortearResposta(cartao, { sortearInteiro: minimo }).atrasoMs).toBe(faixa[0]);
  expect(sortearResposta(cartao, { sortearInteiro: maximo }).atrasoMs).toBe(faixa[1]);
}

describe('F03 tabela do modo padrão e sorteio do atraso', () => {
  it('faixas internas ficam dentro das faixas do brief', () => {
    expect(FAIXA_RAPIDA_MS).toEqual([2200, 4000]);
    expect(FAIXA_LENTA_MS).toEqual([30500, 38500]);
  });

  it('F03-CA01 final 0001 sorteia aprovado com atraso entre 2200 e 4000 ms', () => {
    confereFaixa('4000000000000001', 'aprovado', [2200, 4000]);
  });

  it('F03-CA02 final 0002 sorteia recusado com atraso entre 2200 e 4000 ms', () => {
    confereFaixa('4000000000000002', 'recusado', [2200, 4000]);
  });

  it('F03-CA03 final 0003 sorteia aprovado com atraso entre 30500 e 38500 ms', () => {
    confereFaixa('4000000000000003', 'aprovado', [30500, 38500]);
  });

  it('F03-CA04 final 0004 sorteia recusado com atraso entre 30500 e 38500 ms', () => {
    confereFaixa('4000000000000004', 'recusado', [30500, 38500]);
  });

  it('F03-CA05 outros finais sorteiam recusado com atraso entre 2200 e 4000 ms', () => {
    for (const final of ['0000', '0005', '0009', '0011', '1001', '4444', '9999']) {
      confereFaixa(`400000000000${final}`, 'recusado', [2200, 4000]);
      expect(regraPorFinal(final)).toEqual({ resultado: 'recusado', faixa: FAIXA_RAPIDA_MS });
    }
  });

  it('considera só os 4 últimos dígitos', () => {
    expect(finalDoCartao('4000000000010001')).toBe('0001');
    expect(sortearResposta('4000000000010001', { sortearInteiro: minimo }).resultado).toBe('aprovado');
    expect(finalDoCartao('4000000000000011')).toBe('0011');
    expect(sortearResposta('4000000000000011', { sortearInteiro: minimo }).resultado).toBe('recusado');
    expect(sortearResposta('5555555555554444', { sortearInteiro: minimo })).toEqual({
      finalCartao: '4444',
      resultado: 'recusado',
      atrasoMs: 2200,
    });
  });

  it('1000 sorteios reais ficam dentro das faixas', () => {
    const rapidos = new Set<number>();
    for (let i = 0; i < 1000; i += 1) {
      const rapido = sortearResposta('4000000000000001').atrasoMs;
      const lento = sortearResposta('4000000000000003').atrasoMs;
      expect(Number.isInteger(rapido)).toBe(true);
      expect(rapido).toBeGreaterThanOrEqual(2200);
      expect(rapido).toBeLessThanOrEqual(4000);
      expect(lento).toBeGreaterThanOrEqual(30500);
      expect(lento).toBeLessThanOrEqual(38500);
      rapidos.add(rapido);
    }
    // Uniforme em milissegundos: 1000 sorteios em 1801 valores possíveis quase nunca se repetem muito.
    expect(rapidos.size).toBeGreaterThan(500);
  });

  it('escala multiplica o atraso e arredonda para milissegundos', () => {
    expect(sortearResposta('4000000000000003', { escala: 0.01, sortearInteiro: minimo }).atrasoMs).toBe(305);
    expect(sortearResposta('4000000000000003', { escala: 0.01, sortearInteiro: maximo }).atrasoMs).toBe(385);
    expect(sortearResposta('4000000000000001', { escala: 0.5, sortearInteiro: () => 2201 }).atrasoMs).toBe(1101);
    expect(sortearResposta('4000000000000001', { escala: 1, sortearInteiro: () => 3333 }).atrasoMs).toBe(3333);
  });
});
