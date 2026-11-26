// Tempos de ponta a ponta (solicitação → efeito no tratador), medidos no relógio do banco.
import { describe, expect, it } from 'vitest';
import type { EntregaResultado } from '../../src/features/gateway/public.js';
// Módulos de F01–F04 (sem o ingressos da F05, que registra o próprio tratador/provedor).
import { createBaseTestApp as createTestApp } from '../helpers/base-features.js';
import { aguardarEntrega } from '../helpers/gateway.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Sem nenhuma variável de gateway (nem as do ambiente do processo de testes). */
const SEM_VARIAVEIS_DE_GATEWAY = { GATEWAY_MODE: undefined, GATEWAY_DELAY_SCALE: undefined };

describe('F03 tempos do gateway', () => {
  it('F03-CA01 F03-CA02 F03-CA05 CF02 com a configuração padrão os cartões rápidos são entregues entre 2 e 5 s', async () => {
    // Worker real do processo da aplicação: intervalo padrão de 200 ms e escala 1.
    const { app, db, config } = await createTestApp({ backgroundJobs: true, config: SEM_VARIAVEIS_DE_GATEWAY });
    expect(config.gateway).toEqual({ mode: 'simulado', delayScale: 1 });
    expect(app.gateway.modo).toBe('simulado');
    expect(app.gateway.escala).toBe(1);
    const recebidas = new Map<string, EntregaResultado>();
    app.gateway.aoReceberResultado(async (entrega) => {
      recebidas.set(entrega.referencia, entrega);
    });
    await app.ready();

    const cartoes = [
      ['tkt_final_0001', '4000000000000001', 'aprovado'],
      ['tkt_final_0002', '4000000000000002', 'recusado'],
      ['tkt_final_0009', '4000000000000009', 'recusado'],
    ] as const;
    const solicitacoes = await Promise.all(
      cartoes.map(([referencia, numeroCartao]) => app.gateway.solicitarAutorizacao({ referencia, numeroCartao })),
    );
    const ids = solicitacoes.map((s) => s.tentativaId);

    await sleep(1900);
    const { rows: aos19 } = await db.query<{ pendentes: number; decorrido_ok: boolean }>(
      `SELECT count(*) FILTER (WHERE delivered_at IS NULL) AS pendentes,
              bool_and(clock_timestamp() - requested_at >= interval '1.9 seconds') AS decorrido_ok
         FROM payment_attempts WHERE id = ANY($1::text[])`,
      [ids],
    );
    expect(aos19).toEqual([{ pendentes: 3, decorrido_ok: true }]);
    expect(recebidas.size).toBe(0);

    for (const id of ids) await aguardarEntrega(db, id, { timeoutMs: 5000 });
    const { rows } = await db.query<{ reference: string; result: string; segundos: number; delivery_attempts: number }>(
      `SELECT reference, result, EXTRACT(EPOCH FROM delivered_at - requested_at)::float8 AS segundos, delivery_attempts
         FROM payment_attempts WHERE id = ANY($1::text[]) ORDER BY reference`,
      [ids],
    );
    expect(rows.map((r) => [r.reference, r.result, r.delivery_attempts])).toEqual(
      cartoes.map(([referencia, , resultado]) => [referencia, resultado, 1]),
    );
    for (const row of rows) {
      expect(row.segundos).toBeGreaterThanOrEqual(2.0);
      expect(row.segundos).toBeLessThanOrEqual(5.0);
      expect(recebidas.get(row.reference)?.resultado).toBe(row.result);
    }
  });

  it('F03-CA03 F03-CA04 com escala 0,1 os cartões lentos ficam pendentes aos 2,9 s e são entregues entre 3,0 e 4,0 s', async () => {
    const { app, db } = await createTestApp({ config: { GATEWAY_DELAY_SCALE: '0.1' } });
    expect(app.gateway.escala).toBe(0.1);
    app.gateway.aoReceberResultado(async () => {});
    app.gateway.iniciarWorker({ intervaloMs: 20 });

    const s3 = await app.gateway.solicitarAutorizacao({ referencia: 'tkt_final_0003', numeroCartao: '4000000000000003' });
    const s4 = await app.gateway.solicitarAutorizacao({ referencia: 'tkt_final_0004', numeroCartao: '4000000000000004' });
    const ids = [s3.tentativaId, s4.tentativaId];

    await sleep(2900);
    const { rows: aos29 } = await db.query<{ pendentes: number; decorrido_ok: boolean }>(
      `SELECT count(*) FILTER (WHERE delivered_at IS NULL) AS pendentes,
              bool_and(clock_timestamp() - requested_at >= interval '2.9 seconds') AS decorrido_ok
         FROM payment_attempts WHERE id = ANY($1::text[])`,
      [ids],
    );
    expect(aos29).toEqual([{ pendentes: 2, decorrido_ok: true }]);

    for (const id of ids) await aguardarEntrega(db, id, { timeoutMs: 3000 });
    const { rows } = await db.query<{ reference: string; result: string; segundos: number; delay_ms: number }>(
      `SELECT reference, result, EXTRACT(EPOCH FROM delivered_at - requested_at)::float8 AS segundos, delay_ms
         FROM payment_attempts WHERE id = ANY($1::text[]) ORDER BY reference`,
      [ids],
    );
    expect(rows.map((r) => [r.reference, r.result])).toEqual([
      ['tkt_final_0003', 'aprovado'],
      ['tkt_final_0004', 'recusado'],
    ]);
    for (const row of rows) {
      expect(row.delay_ms).toBeGreaterThanOrEqual(3050);
      expect(row.delay_ms).toBeLessThanOrEqual(3850);
      expect(row.segundos).toBeGreaterThanOrEqual(3.0);
      expect(row.segundos).toBeLessThanOrEqual(4.0);
    }
  });
});
