// Auxiliares do gateway para os testes (F03 e consumidoras, como a compra da F05): vencer
// tentativas sem esperar os tempos reais, disparar uma varredura e aguardar uma entrega.
import type { FastifyInstance } from 'fastify';
import type { Queryable } from '../../src/db/pool.js';
import type { ResultadoVarredura, TentativaPagamento } from '../../src/features/gateway/public.js';
import { buscarTentativa, paraTentativaPagamento } from '../../src/features/gateway/repositorio.js';

/**
 * Torna vencidas agora as tentativas pendentes (todas ou só as das referências dadas):
 * delay_ms = 0 e due_at = next_delivery_at = requested_at. Devolve quantas mudaram.
 */
export async function vencerTentativas(db: Queryable, opcoes: { referencias?: readonly string[] } = {}): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE payment_attempts
        SET delay_ms = 0, due_at = requested_at, next_delivery_at = requested_at, updated_at = clock_timestamp()
      WHERE delivered_at IS NULL
        AND ($1::text[] IS NULL OR reference = ANY($1::text[]))`,
    [opcoes.referencias ?? null],
  );
  return rowCount ?? 0;
}

/** Uma varredura completa do gateway da aplicação (o que o worker faz a cada 200 ms). */
export function entregarVencidas(app: FastifyInstance): Promise<ResultadoVarredura> {
  return app.gateway.processarVencidas();
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera delivered_at da tentativa (consulta a cada 20 ms) e devolve a tentativa entregue. */
export async function aguardarEntrega(
  db: Queryable,
  tentativaId: string,
  opcoes: { timeoutMs?: number } = {},
): Promise<TentativaPagamento> {
  const timeoutMs = opcoes.timeoutMs ?? 2000;
  const limite = Date.now() + timeoutMs;
  for (;;) {
    const linha = await buscarTentativa(db, tentativaId);
    if (linha === null) throw new Error(`aguardarEntrega: tentativa ${tentativaId} não existe`);
    if (linha.delivered_at !== null) return paraTentativaPagamento(linha);
    if (Date.now() >= limite) {
      throw new Error(
        `aguardarEntrega: tentativa ${tentativaId} não foi entregue em ${timeoutMs} ms ` +
          `(tentativas de entrega: ${linha.delivery_attempts}, último erro: ${linha.last_error ?? 'nenhum'})`,
      );
    }
    await sleep(20);
  }
}
