// SQL da tabela payment_attempts. Todos os instantes vêm do relógio do banco.
import type { Queryable } from '../../db/pool.js';
import { ErroGateway } from './erros.js';
import type { OrigemTentativa, ResultadoPagamento, TentativaPagamento } from './types.js';

export interface LinhaTentativa {
  id: string;
  origin: OrigemTentativa;
  reference: string;
  card_last4: string;
  result: ResultadoPagamento;
  delay_ms: number;
  requested_at: Date;
  due_at: Date;
  next_delivery_at: Date;
  delivered_at: Date | null;
  delivery_attempts: number;
  last_error: string | null;
  updated_at: Date;
  /** delivered_at − requested_at em segundos, com uma casa decimal ("3.4"); null se pendente. */
  segundos_ate_entrega: string | null;
}

const COLUNAS = `id, origin, reference, card_last4, result, delay_ms, requested_at, due_at, next_delivery_at,
  delivered_at, delivery_attempts, last_error, updated_at,
  CASE WHEN delivered_at IS NULL THEN NULL
       ELSE round(round(EXTRACT(EPOCH FROM delivered_at - requested_at), 3), 1)::text END AS segundos_ate_entrega`;

const UNICA_POR_REFERENCIA = 'payment_attempts_origin_reference_key';

export interface DadosTentativa {
  id: string;
  origem: OrigemTentativa;
  referencia: string;
  /** Só os 4 últimos dígitos (a coluna recusa qualquer outra coisa). */
  finalCartao: string;
  resultado: ResultadoPagamento;
  atrasoMs: number;
}

function violouUnicidade(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint: nome } = error as { code?: unknown; constraint?: unknown };
  return code === '23505' && nome === constraint;
}

/**
 * Grava a tentativa num único INSERT: requested_at = clock_timestamp() do comando (não o início da
 * transação do chamador) e prazo absoluto due_at = next_delivery_at = requested_at + atraso.
 */
export async function inserirTentativa(
  executor: Queryable,
  dados: DadosTentativa,
): Promise<{ requestedAt: Date; dueAt: Date }> {
  try {
    const { rows } = await executor.query<{ requested_at: Date; due_at: Date }>(
      `WITH agora AS (SELECT clock_timestamp() AS t)
       INSERT INTO payment_attempts
         (id, origin, reference, card_last4, result, delay_ms, requested_at, due_at, next_delivery_at, updated_at)
       SELECT $1, $2, $3, $4, $5, $6::integer, t,
              t + $6::integer * interval '1 millisecond',
              t + $6::integer * interval '1 millisecond',
              t
         FROM agora
       RETURNING requested_at, due_at`,
      [dados.id, dados.origem, dados.referencia, dados.finalCartao, dados.resultado, dados.atrasoMs],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('payment_attempts: INSERT não devolveu a tentativa');
    return { requestedAt: row.requested_at, dueAt: row.due_at };
  } catch (error) {
    if (violouUnicidade(error, UNICA_POR_REFERENCIA)) {
      throw new ErroGateway('referencia_duplicada', { cause: error });
    }
    throw error;
  }
}

export async function buscarTentativa(executor: Queryable, id: string): Promise<LinhaTentativa | null> {
  const { rows } = await executor.query<LinhaTentativa>(`SELECT ${COLUNAS} FROM payment_attempts WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** Linha do banco → tipo público (o resultado só aparece depois da entrega). */
export function paraTentativaPagamento(linha: LinhaTentativa): TentativaPagamento {
  return {
    tentativaId: linha.id,
    origem: linha.origin,
    referencia: linha.reference,
    finalCartao: linha.card_last4,
    solicitadoEm: linha.requested_at,
    prazo: linha.due_at,
    entregueEm: linha.delivered_at,
    tentativasDeEntrega: linha.delivery_attempts,
    ultimoErro: linha.last_error,
    resultado: linha.delivered_at === null ? null : linha.result,
  };
}
