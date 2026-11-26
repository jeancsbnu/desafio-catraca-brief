// Gateway de pagamento simulado: solicitação imediata com prazo absoluto no relógio do banco.
import type { AppConfig } from '../../config.js';
import { newId } from '../../core/ids.js';
import type { Db, Queryable } from '../../db/pool.js';
import { ErroGateway } from './erros.js';
import { buscarTentativa, inserirTentativa, paraTentativaPagamento } from './repositorio.js';
import { sortearResposta, type SortearInteiro } from './tabela.js';
import type { GatewaySimulado, OrigemTentativa, SolicitacaoRegistrada } from './types.js';

const NUMERO_CARTAO = /^[0-9]{16}$/;
const REFERENCIA = /^[A-Za-z0-9_-]{1,64}$/;

export interface OpcoesGateway {
  db: Db;
  config: Pick<AppConfig, 'gateway'>;
  /** Gerador do sorteio (só nos testes). */
  sortearInteiro?: SortearInteiro;
}

export function criarGatewaySimulado(opcoes: OpcoesGateway): GatewaySimulado {
  const { db } = opcoes;
  const modo = opcoes.config.gateway.mode;
  const escala = opcoes.config.gateway.delayScale;
  const sortearInteiro = opcoes.sortearInteiro;

  async function solicitar(
    origem: OrigemTentativa,
    referencia: unknown,
    numeroCartao: unknown,
    executor: Queryable,
  ): Promise<SolicitacaoRegistrada> {
    // Validações antes de qualquer SQL: nada é gravado com entrada inválida.
    if (typeof numeroCartao !== 'string' || !NUMERO_CARTAO.test(numeroCartao)) {
      throw new ErroGateway('cartao_invalido');
    }
    if (typeof referencia !== 'string' || !REFERENCIA.test(referencia)) {
      throw new ErroGateway('referencia_invalida');
    }

    const sorteio = sortearResposta(numeroCartao, { escala, sortearInteiro });
    const tentativaId = newId('pay');
    const { requestedAt, dueAt } = await inserirTentativa(executor, {
      id: tentativaId,
      origem,
      referencia,
      finalCartao: sorteio.finalCartao,
      resultado: sorteio.resultado,
      atrasoMs: sorteio.atrasoMs,
    });
    return { tentativaId, referencia, finalCartao: sorteio.finalCartao, solicitadoEm: requestedAt, prazo: dueAt };
  }

  return {
    modo,
    escala,

    solicitarAutorizacao(pedido, opcoesSolicitacao = {}) {
      return solicitar('compra', pedido.referencia, pedido.numeroCartao, opcoesSolicitacao.transacao ?? db);
    },

    solicitarDiagnostico(numeroCartao) {
      return solicitar('diagnostico', newId('sim'), numeroCartao, db);
    },

    async consultarTentativa(tentativaId, executor = db) {
      const linha = await buscarTentativa(executor, tentativaId);
      return linha === null ? null : paraTentativaPagamento(linha);
    },
  };
}
