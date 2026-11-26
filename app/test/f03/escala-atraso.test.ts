// Só os testes do F03-CA08 (o contrato roda este arquivo isolado).
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { criarGatewaySimulado } from '../../src/features/gateway/public.js';
import { sortearResposta } from '../../src/features/gateway/tabela.js';
import { createTestApp } from '../helpers/app.js';
import { testDb } from '../helpers/db.js';
import { aguardarEntrega } from '../helpers/gateway.js';

async function atrasoGravado(tentativaId: string): Promise<{ delay_ms: number; prazo_s: number }> {
  const { rows } = await testDb().query<{ delay_ms: number; prazo_s: number }>(
    'SELECT delay_ms, EXTRACT(EPOCH FROM due_at - requested_at)::float8 AS prazo_s FROM payment_attempts WHERE id = $1',
    [tentativaId],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`tentativa ${tentativaId} não encontrada`);
  return row;
}

describe('F03-CA08 escala de atraso do gateway', () => {
  it('F03-CA08 sem variáveis de ambiente a escala é 1 e os atrasos ficam nas faixas da tabela', () => {
    const config = loadConfig({});
    expect(config.gateway).toEqual({ mode: 'simulado', delayScale: 1 });
    expect(config.warnings).toEqual([]);

    const escala = config.gateway.delayScale;
    for (let i = 0; i < 200; i += 1) {
      for (const cartao of ['4000000000000001', '4000000000000002', '4000000000000009']) {
        const { atrasoMs } = sortearResposta(cartao, { escala });
        expect(atrasoMs).toBeGreaterThanOrEqual(2200);
        expect(atrasoMs).toBeLessThanOrEqual(4000);
      }
      for (const cartao of ['4000000000000003', '4000000000000004']) {
        const { atrasoMs } = sortearResposta(cartao, { escala });
        expect(atrasoMs).toBeGreaterThanOrEqual(30500);
        expect(atrasoMs).toBeLessThanOrEqual(38500);
      }
    }
  });

  it('F03-CA08 GATEWAY_DELAY_SCALE fora de NODE_ENV=test não altera os atrasos', async () => {
    for (const nodeEnv of ['production', 'development']) {
      const config = loadConfig({ NODE_ENV: nodeEnv, GATEWAY_DELAY_SCALE: '0.01' });
      expect(config.gateway.delayScale).toBe(1);
      expect(config.warnings).toEqual([
        `aviso: GATEWAY_DELAY_SCALE ignorada fora do ambiente de testes (NODE_ENV=${nodeEnv}); vale 1`,
      ]);

      const gateway = criarGatewaySimulado({ db: testDb(), config });
      expect(gateway.escala).toBe(1);
      const solicitacao = await gateway.solicitarDiagnostico('4000000000000003');
      const { delay_ms, prazo_s } = await atrasoGravado(solicitacao.tentativaId);
      expect(delay_ms).toBeGreaterThanOrEqual(30500);
      expect(delay_ms).toBeLessThanOrEqual(38500);
      expect(prazo_s).toBeGreaterThanOrEqual(30.5);
    }
  });

  it('F03-CA08 com NODE_ENV=test e GATEWAY_DELAY_SCALE=0.01 o prazo escala e a entrega acontece no prazo escalado', async () => {
    const { app, db, config } = await createTestApp({ config: { NODE_ENV: 'test', GATEWAY_DELAY_SCALE: '0.01' } });
    expect(config.gateway.delayScale).toBe(0.01);
    expect(app.gateway.escala).toBe(0.01);

    const solicitacao = await app.gateway.solicitarDiagnostico('4000000000000003');
    const { delay_ms } = await atrasoGravado(solicitacao.tentativaId);
    expect(delay_ms).toBeGreaterThanOrEqual(305);
    expect(delay_ms).toBeLessThanOrEqual(385);

    app.gateway.iniciarWorker({ intervaloMs: 20 });
    const entregue = await aguardarEntrega(db, solicitacao.tentativaId, { timeoutMs: 2000 });
    expect(entregue.resultado).toBe('aprovado');
    const { rows } = await db.query<{ segundos: number }>(
      'SELECT EXTRACT(EPOCH FROM delivered_at - requested_at)::float8 AS segundos FROM payment_attempts WHERE id = $1',
      [solicitacao.tentativaId],
    );
    expect(rows[0]?.segundos).toBeGreaterThanOrEqual(0.3);
    expect(rows[0]?.segundos).toBeLessThanOrEqual(0.5);
  });
});
