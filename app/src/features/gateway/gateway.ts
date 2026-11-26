// Gateway de pagamento simulado: solicitação imediata com prazo absoluto no relógio do banco e
// entrega assíncrona do resultado, exatamente uma vez, pelo worker do processo da aplicação.
import type { AppConfig } from '../../config.js';
import { errorMessage } from '../../core/boot-log.js';
import { newId } from '../../core/ids.js';
import type { Db, Queryable } from '../../db/pool.js';
import { ErroGateway } from './erros.js';
import {
  buscarTentativa,
  inserirTentativa,
  marcarEntregue,
  paraTentativaPagamento,
  registrarFalha,
  travarProximaVencida,
  type LinhaTentativa,
} from './repositorio.js';
import { sortearResposta, type SortearInteiro } from './tabela.js';
import type {
  EntregaResultado,
  GatewaySimulado,
  LoggerGateway,
  OrigemTentativa,
  SolicitacaoRegistrada,
  TratadorResultado,
} from './types.js';
import { criarLacoDeVarredura, INTERVALO_VARREDURA_MS, type LacoDeVarredura } from './worker.js';

const NUMERO_CARTAO = /^[0-9]{16}$/;
const REFERENCIA = /^[A-Za-z0-9_-]{1,64}$/;
/** Máximo de entregas por varredura. */
const LIMITE_POR_VARREDURA = 500;

const nada = (): void => {};
/** Logger que descarta tudo (CLI e uso fora do Fastify). */
export const loggerSilencioso: LoggerGateway = { debug: nada, info: nada, warn: nada, error: nada };

export interface OpcoesGateway {
  db: Db;
  config: Pick<AppConfig, 'gateway'>;
  log?: LoggerGateway;
  /** Gerador do sorteio (só nos testes). */
  sortearInteiro?: SortearInteiro;
}

type ResultadoDaEntrega = 'entregue' | 'falha' | 'nenhuma';

export function criarGatewaySimulado(opcoes: OpcoesGateway): GatewaySimulado {
  const { db } = opcoes;
  const log = opcoes.log ?? loggerSilencioso;
  const modo = opcoes.config.gateway.mode;
  const escala = opcoes.config.gateway.delayScale;
  const sortearInteiro = opcoes.sortearInteiro;

  // Tratadores por origem. O de diagnóstico é interno: a marca delivered_at é o efeito observável.
  const tratadores = new Map<OrigemTentativa, TratadorResultado>([['diagnostico', async () => {}]]);
  let laco: LacoDeVarredura | undefined;

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
    log.debug({ tentativaId, referencia, origem }, 'gateway: tentativa registrada');
    return { tentativaId, referencia, finalCartao: sorteio.finalCartao, solicitadoEm: requestedAt, prazo: dueAt };
  }

  /** Uma entrega numa transação própria: trava, chama o tratador, marca e faz commit. */
  async function entregarUma(): Promise<ResultadoDaEntrega> {
    const origens = [...tratadores.keys()];
    const client = await db.connect();
    let linha: LinhaTentativa | null = null;
    let erroDaEntrega: unknown;
    let descartarConexao: Error | undefined;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '2s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      linha = await travarProximaVencida(client, origens);
      if (linha === null) {
        await client.query('COMMIT');
        return 'nenhuma';
      }

      const tratador = tratadores.get(linha.origin);
      if (tratador === undefined) throw new Error(`nenhum tratador para a origem ${linha.origin}`);
      const entrega: EntregaResultado = {
        tentativaId: linha.id,
        referencia: linha.reference,
        resultado: linha.result,
        finalCartao: linha.card_last4,
        solicitadoEm: linha.requested_at,
        prazo: linha.due_at,
        tentativaDeEntrega: linha.delivery_attempts + 1,
      };
      await tratador(entrega, client);

      const marca = await marcarEntregue(client, linha.id);
      if (marca === null) throw new Error('a tentativa já estava entregue');
      await client.query('COMMIT');

      log.info(
        {
          tentativaId: linha.id,
          referencia: linha.reference,
          origem: linha.origin,
          resultado: linha.result,
          tentativa: marca.deliveryAttempts,
          atrasoMs: marca.deliveredAt.getTime() - marca.requestedAt.getTime(),
        },
        'gateway: resultado entregue',
      );
      return 'entregue';
    } catch (erro) {
      erroDaEntrega = erro;
      try {
        await client.query('ROLLBACK');
      } catch (erroRollback) {
        // Conexão em estado ruim: descarta o cliente em vez de devolvê-lo ao pool.
        descartarConexao = erroRollback instanceof Error ? erroRollback : new Error(String(erroRollback));
      }
    } finally {
      client.release(descartarConexao);
    }

    // Falha antes de travar uma tentativa (ex.: banco indisponível): é uma falha da varredura.
    if (linha === null) throw erroDaEntrega;

    let tentativa = linha.delivery_attempts + 1;
    try {
      tentativa = (await registrarFalha(db, linha.id, errorMessage(erroDaEntrega))) ?? tentativa;
    } finally {
      log.error(
        { tentativaId: linha.id, referencia: linha.reference, origem: linha.origin, tentativa, err: erroDaEntrega },
        'gateway: falha na entrega',
      );
    }
    return 'falha';
  }

  async function processarVencidas(opcoesVarredura: { limite?: number } = {}) {
    const limite = opcoesVarredura.limite ?? LIMITE_POR_VARREDURA;
    let entregues = 0;
    let falhas = 0;
    while (entregues + falhas < limite) {
      const resultado = await entregarUma();
      if (resultado === 'nenhuma') break;
      if (resultado === 'entregue') entregues += 1;
      else falhas += 1;
    }
    return { entregues, falhas };
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

    aoReceberResultado(tratador) {
      if (tratadores.has('compra')) throw new ErroGateway('tratador_ja_registrado');
      tratadores.set('compra', tratador);
    },

    processarVencidas,

    async consultarTentativa(tentativaId, executor = db) {
      const linha = await buscarTentativa(executor, tentativaId);
      return linha === null ? null : paraTentativaPagamento(linha);
    },

    iniciarWorker(opcoesWorker = {}) {
      if (laco?.ativo === true) return;
      const intervaloMs = opcoesWorker.intervaloMs ?? INTERVALO_VARREDURA_MS;
      laco = criarLacoDeVarredura({ processar: () => processarVencidas(), intervaloMs, log });
      log.info({ modo, escala, intervaloMs }, 'gateway: worker iniciado');
      laco.iniciar();
    },

    async pararWorker() {
      const atual = laco;
      laco = undefined;
      if (atual === undefined || !atual.ativo) return;
      await atual.parar();
      log.info({}, 'gateway: worker parado');
    },
  };
}
