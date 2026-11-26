// SQL da tabela payment_attempts. Todos os instantes vêm do relógio do banco.
import type { DbClient, Queryable } from '../../db/pool.js';
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

/**
 * Trava a próxima tentativa vencida de uma das origens (dentro da transação de entrega).
 * SKIP LOCKED: outro worker nunca espera pela mesma linha; FOR UPDATE reavalia o WHERE depois da
 * trava, então uma tentativa recém-entregue por outro worker não volta.
 */
export async function travarProximaVencida(
  client: DbClient,
  origens: readonly OrigemTentativa[],
): Promise<LinhaTentativa | null> {
  if (origens.length === 0) return null;
  const { rows } = await client.query<LinhaTentativa>(
    `SELECT ${COLUNAS}
       FROM payment_attempts
      WHERE delivered_at IS NULL
        AND next_delivery_at <= now()
        AND origin = ANY($1::text[])
      ORDER BY next_delivery_at, id
      LIMIT 1
        FOR UPDATE SKIP LOCKED`,
    [origens],
  );
  return rows[0] ?? null;
}

/** Marca a entrega na mesma transação do tratador; devolve null se a linha já estava entregue. */
export async function marcarEntregue(
  client: DbClient,
  id: string,
): Promise<{ requestedAt: Date; deliveredAt: Date; deliveryAttempts: number } | null> {
  const { rows } = await client.query<{ requested_at: Date; delivered_at: Date; delivery_attempts: number }>(
    `UPDATE payment_attempts
        SET delivered_at = clock_timestamp(),
            delivery_attempts = delivery_attempts + 1,
            last_error = NULL,
            updated_at = clock_timestamp()
      WHERE id = $1 AND delivered_at IS NULL
      RETURNING requested_at, delivered_at, delivery_attempts`,
    [id],
  );
  const row = rows[0];
  return row === undefined
    ? null
    : { requestedAt: row.requested_at, deliveredAt: row.delivered_at, deliveryAttempts: row.delivery_attempts };
}

/**
 * Falha de entrega (fora da transação desfeita): conta a tentativa, guarda o erro e adia a próxima
 * entrega com espera crescente 0,2 s × 2^(n−1), até 5 s (o expoente usa o valor anterior e é
 * limitado a 10 só para não estourar o double; 0,2 × 2^5 já passa de 5 s).
 */
export async function registrarFalha(db: Queryable, id: string, mensagem: string): Promise<number | null> {
  const { rows } = await db.query<{ delivery_attempts: number }>(
    `UPDATE payment_attempts
        SET delivery_attempts = delivery_attempts + 1,
            last_error = left($2, 500),
            next_delivery_at = greatest(
              due_at,
              clock_timestamp() + make_interval(secs => least(0.2 * 2 ^ least(delivery_attempts, 10), 5))
            ),
            updated_at = clock_timestamp()
      WHERE id = $1 AND delivered_at IS NULL
      RETURNING delivery_attempts`,
    [id, mensagem],
  );
  return rows[0]?.delivery_attempts ?? null;
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
