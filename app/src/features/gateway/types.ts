// Tipos públicos do gateway de pagamento simulado (usados pela compra, F05).
import type { GatewayMode } from '../../config.js';
import type { DbClient, Queryable } from '../../db/pool.js';

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

/** O que o worker entrega ao tratador, uma única vez por tentativa. */
export interface EntregaResultado {
  tentativaId: string;
  referencia: string;
  resultado: ResultadoPagamento;
  finalCartao: string;
  solicitadoEm: Date;
  prazo: Date;
  /** 1 na primeira entrega; maior depois de falhas do tratador. */
  tentativaDeEntrega: number;
}

/**
 * Tratador do resultado (F05). Roda dentro da transação que marca a entrega: usa `transacao` em
 * todas as escritas, não faz COMMIT/ROLLBACK, não toca em payment_attempts e é idempotente.
 * Lançar erro desfaz o efeito e agenda a reentrega. Limites: lock_timeout 2 s, statement_timeout 5 s.
 */
export type TratadorResultado = (entrega: EntregaResultado, transacao: DbClient) => Promise<void>;

/** O pedaço do logger do Fastify (pino) que o gateway usa. */
export interface LoggerGateway {
  debug(dados: object, mensagem: string): void;
  info(dados: object, mensagem: string): void;
  warn(dados: object, mensagem: string): void;
  error(dados: object, mensagem: string): void;
}

export interface ResultadoVarredura {
  entregues: number;
  falhas: number;
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
  /** Registra o tratador das compras (um por instância; o segundo é ErroGateway). */
  aoReceberResultado(tratador: TratadorResultado): void;
  /** Uma varredura completa: entrega as tentativas vencidas, até `limite` (padrão 500). */
  processarVencidas(opcoes?: { limite?: number }): Promise<ResultadoVarredura>;
  consultarTentativa(tentativaId: string, executor?: Queryable): Promise<TentativaPagamento | null>;
  /** Inicia o laço de varredura (padrão 200 ms; primeira varredura imediata). Idempotente. */
  iniciarWorker(opcoes?: { intervaloMs?: number }): void;
  /** Para o laço e espera a varredura em andamento. Idempotente. */
  pararWorker(): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Gateway de pagamento simulado (módulo gateway, F03). */
    gateway: GatewaySimulado;
  }
}
