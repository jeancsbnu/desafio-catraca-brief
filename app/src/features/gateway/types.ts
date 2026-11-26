// Tipos públicos do gateway de pagamento simulado (usados pela compra, F05).
import type { GatewayMode } from '../../config.js';
import type { Queryable } from '../../db/pool.js';

export type ResultadoPagamento = 'aprovado' | 'recusado';

/** compra: resultado vai ao tratador registrado (F05); diagnostico: tratador interno (CLI). */
export type OrigemTentativa = 'compra' | 'diagnostico';

export interface PedidoAutorizacao {
  /** Referência do chamador (a F05 usa o id do ingresso, tkt_…): ^[A-Za-z0-9_-]{1,64}$. */
  referencia: string;
  /** Número do cartão com exatamente 16 dígitos. Nunca é gravado nem logado por inteiro. */
  numeroCartao: string;
}

export interface OpcoesSolicitacao {
  /** Cliente pg de uma transação aberta pelo chamador; sem ele, um INSERT autônomo no pool. */
  transacao?: Queryable;
}

/** Retorno imediato da solicitação: não inclui o resultado. */
export interface SolicitacaoRegistrada {
  tentativaId: string;
  referencia: string;
  finalCartao: string;
  solicitadoEm: Date;
  /** Prazo de resposta (solicitadoEm + atraso sorteado), no relógio do banco. */
  prazo: Date;
}

export interface TentativaPagamento {
  tentativaId: string;
  origem: OrigemTentativa;
  referencia: string;
  finalCartao: string;
  solicitadoEm: Date;
  prazo: Date;
  entregueEm: Date | null;
  tentativasDeEntrega: number;
  ultimoErro: string | null;
  /** null enquanto a tentativa não foi entregue. */
  resultado: ResultadoPagamento | null;
}

export interface GatewaySimulado {
  /** Sempre 'simulado' (o único modo que a configuração aceita). */
  readonly modo: GatewayMode;
  /** config.gateway.delayScale (1 fora de NODE_ENV=test). */
  readonly escala: number;
  /** Valida, sorteia e grava a tentativa (origem compra); retorna na hora, sem o resultado. */
  solicitarAutorizacao(pedido: PedidoAutorizacao, opcoes?: OpcoesSolicitacao): Promise<SolicitacaoRegistrada>;
  /** Igual, com origem diagnostico e referência sim_… (CLI e testes). */
  solicitarDiagnostico(numeroCartao: string): Promise<SolicitacaoRegistrada>;
  consultarTentativa(tentativaId: string, executor?: Queryable): Promise<TentativaPagamento | null>;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Gateway de pagamento simulado (módulo gateway, F03). */
    gateway: GatewaySimulado;
  }
}
