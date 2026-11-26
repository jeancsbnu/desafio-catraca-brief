// Tabela do modo padrão do gateway (copiada do brief) e sorteio do atraso de cada resposta.
//
// Brief: final 0001 aprovado em 2–5 s; 0002 recusado em 2–5 s; 0003 aprovado em 30–40 s;
// 0004 recusado em 30–40 s; qualquer outro final recusado em 2–5 s.
//
// O atraso é sorteado numa faixa interna mais estreita que a do brief: a entrega acontece na
// varredura seguinte ao prazo (até 200 ms depois) e precisa de folga para quem observa por consulta
// periódica. Orçamento na spec da F03, seção 5.2.
import { randomInt } from 'node:crypto';
import type { ResultadoPagamento } from './types.js';

/** Faixa inclusiva de atraso em milissegundos. */
export type FaixaMs = readonly [min: number, max: number];

/** Respostas "entre 2 e 5 segundos" do brief. */
export const FAIXA_RAPIDA_MS: FaixaMs = [2200, 4000];
/** Respostas "entre 30 e 40 segundos" do brief. */
export const FAIXA_LENTA_MS: FaixaMs = [30500, 38500];

export interface RegraDoFinal {
  resultado: ResultadoPagamento;
  faixa: FaixaMs;
}

const REGRAS: Readonly<Record<string, RegraDoFinal>> = {
  '0001': { resultado: 'aprovado', faixa: FAIXA_RAPIDA_MS },
  '0002': { resultado: 'recusado', faixa: FAIXA_RAPIDA_MS },
  '0003': { resultado: 'aprovado', faixa: FAIXA_LENTA_MS },
  '0004': { resultado: 'recusado', faixa: FAIXA_LENTA_MS },
};

const REGRA_OUTROS_FINAIS: RegraDoFinal = { resultado: 'recusado', faixa: FAIXA_RAPIDA_MS };

/** Sorteia um inteiro em [min; max] (inclusivo). */
export type SortearInteiro = (min: number, max: number) => number;

/** Sorteio uniforme em milissegundos com node:crypto. */
export const sortearInteiroPadrao: SortearInteiro = (min, max) => randomInt(min, max + 1);

/** "Final" do cartão: os 4 últimos dígitos. */
export function finalDoCartao(numeroCartao: string): string {
  return numeroCartao.slice(-4);
}

export function regraPorFinal(final: string): RegraDoFinal {
  return REGRAS[final] ?? REGRA_OUTROS_FINAIS;
}

export interface RespostaSorteada {
  finalCartao: string;
  resultado: ResultadoPagamento;
  /** Atraso já multiplicado pela escala, arredondado para milissegundos. */
  atrasoMs: number;
}

export interface OpcoesSorteio {
  /** Escala de atraso (config.gateway.delayScale; 1 fora de NODE_ENV=test). */
  escala?: number;
  sortearInteiro?: SortearInteiro;
}

export function sortearResposta(numeroCartao: string, opcoes: OpcoesSorteio = {}): RespostaSorteada {
  const escala = opcoes.escala ?? 1;
  const sortearInteiro = opcoes.sortearInteiro ?? sortearInteiroPadrao;
  const finalCartao = finalDoCartao(numeroCartao);
  const { resultado, faixa } = regraPorFinal(finalCartao);
  const sorteado = sortearInteiro(faixa[0], faixa[1]);
  return { finalCartao, resultado, atrasoMs: Math.round(sorteado * escala) };
}
