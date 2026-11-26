import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db/pool.js';
import { criarGatewaySimulado, type TratadorResultado } from '../../src/features/gateway/public.js';
import { createTestApp } from '../helpers/app.js';
import { testDatabaseUrl, testDb } from '../helpers/db.js';
import { aguardarEntrega, vencerTentativas } from '../helpers/gateway.js';

const EFEITOS = 'f03_teste_retomada.efeitos';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  await testDb().query(
    `CREATE SCHEMA IF NOT EXISTS f03_teste_retomada;
     CREATE TABLE IF NOT EXISTS ${EFEITOS} (referencia text PRIMARY KEY, tentativa integer NOT NULL)`,
  );
});

beforeEach(async () => {
  await testDb().query(`TRUNCATE ${EFEITOS}`);
});

afterAll(async () => {
  await testDb().query('DROP SCHEMA IF EXISTS f03_teste_retomada CASCADE');
});

describe('F03 retomada depois de reinício e entrega única', () => {
  it('F03-CA06 tentativa pendente criada antes do reinício é entregue no prazo original por um worker novo', async () => {
    // Aplicação A solicita (escala 0,05: final 0003 vence em 1,5–1,9 s) e é encerrada.
    const a = await createTestApp({ config: { GATEWAY_DELAY_SCALE: '0.05' } });
    const solicitacao = await a.app.gateway.solicitarAutorizacao({
      referencia: 'tkt_reinicio',
      numeroCartao: '4000000000000003',
    });
    await a.app.close();

    // Aplicação B (processo novo) registra o tratador e inicia o worker.
    const b = await createTestApp();
    const entregas: string[] = [];
    b.app.gateway.aoReceberResultado(async (entrega) => {
      entregas.push(entrega.referencia);
    });
    b.app.gateway.iniciarWorker({ intervaloMs: 20 });
    expect(await b.app.gateway.consultarTentativa(solicitacao.tentativaId)).toMatchObject({ entregueEm: null });

    const entregue = await aguardarEntrega(b.db, solicitacao.tentativaId, { timeoutMs: 4000 });
    expect(entregue.prazo.getTime()).toBe(solicitacao.prazo.getTime());
    expect(entregue).toMatchObject({ resultado: 'aprovado', tentativasDeEntrega: 1 });
    const { rows } = await b.db.query<{ no_prazo: boolean; ate_250ms: boolean; atraso_ok: boolean }>(
      `SELECT delivered_at >= due_at AS no_prazo,
              delivered_at <= due_at + interval '250 milliseconds' AS ate_250ms,
              delay_ms BETWEEN 1525 AND 1925 AS atraso_ok
         FROM payment_attempts WHERE id = $1`,
      [solicitacao.tentativaId],
    );
    expect(rows).toEqual([{ no_prazo: true, ate_250ms: true, atraso_ok: true }]);

    await sleep(100);
    expect(entregas).toEqual(['tkt_reinicio']);
  });

  it('F03-CA06 prazo vencido com a aplicação parada é entregue logo na primeira varredura', async () => {
    const a = await createTestApp({ config: { GATEWAY_DELAY_SCALE: '0.05' } });
    const solicitacao = await a.app.gateway.solicitarAutorizacao({
      referencia: 'tkt_parada',
      numeroCartao: '4000000000000001',
    });
    await a.app.close();
    await sleep(400); // o prazo (110–200 ms) vence com a aplicação parada

    const db = testDb();
    const { rows: antes } = await db.query<{ pendente: boolean; vencida: boolean }>(
      'SELECT delivered_at IS NULL AS pendente, due_at < clock_timestamp() AS vencida FROM payment_attempts WHERE id = $1',
      [solicitacao.tentativaId],
    );
    expect(antes).toEqual([{ pendente: true, vencida: true }]);

    // Aplicação B com backgroundJobs: o worker inicia no onReady com o intervalo padrão (200 ms).
    const b = await createTestApp({ backgroundJobs: true });
    const entregas: string[] = [];
    b.app.gateway.aoReceberResultado(async (entrega) => {
      entregas.push(entrega.referencia);
    });
    const { rows: inicio } = await db.query<{ t: Date }>('SELECT clock_timestamp() AS t');
    await b.app.ready();

    await aguardarEntrega(db, solicitacao.tentativaId, { timeoutMs: 2000 });
    const { rows } = await db.query<{ ate_1s: boolean; delivery_attempts: number }>(
      `SELECT delivered_at <= $2::timestamptz + interval '1 second' AS ate_1s, delivery_attempts
         FROM payment_attempts WHERE id = $1`,
      [solicitacao.tentativaId, inicio[0]?.t],
    );
    expect(rows).toEqual([{ ate_1s: true, delivery_attempts: 1 }]);
    await sleep(300);
    expect(entregas).toEqual(['tkt_parada']);
  });

  it('F03-CA06 dois workers concorrentes entregam cada tentativa uma única vez', async () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    const outroProcesso = createPool({ databaseUrl: testDatabaseUrl() });
    const tratador: TratadorResultado = async (entrega, transacao) => {
      // A chave única por referência faria o tratador falhar se a mesma tentativa chegasse duas vezes.
      await transacao.query(`INSERT INTO ${EFEITOS} (referencia, tentativa) VALUES ($1, $2)`, [
        entrega.referencia,
        entrega.tentativaDeEntrega,
      ]);
      await transacao.query('SELECT pg_sleep(0.002)');
    };
    try {
      for (let rodada = 1; rodada <= 3; rodada += 1) {
        await testDb().query(`TRUNCATE ${EFEITOS}`);
        const a = criarGatewaySimulado({ db: testDb(), config });
        const b = criarGatewaySimulado({ db: outroProcesso, config });
        a.aoReceberResultado(tratador);
        b.aoReceberResultado(tratador);

        const ids: string[] = [];
        for (let i = 0; i < 60; i += 1) {
          const cartao = i % 2 === 0 ? '4000000000000001' : '4000000000000002';
          ids.push((await a.solicitarAutorizacao({ referencia: `tkt_r${rodada}_${i}`, numeroCartao: cartao })).tentativaId);
        }
        expect(await vencerTentativas(testDb())).toBe(60);

        const [ra, rb] = await Promise.all([a.processarVencidas(), b.processarVencidas()]);
        expect(ra.falhas + rb.falhas).toBe(0);
        expect(ra.entregues + rb.entregues).toBe(60);

        const { rows: efeitos } = await testDb().query<{ n: number; distintas: number; primeira: number }>(
          `SELECT count(*) AS n, count(DISTINCT referencia) AS distintas,
                  count(*) FILTER (WHERE tentativa = 1) AS primeira
             FROM ${EFEITOS}`,
        );
        expect(efeitos).toEqual([{ n: 60, distintas: 60, primeira: 60 }]);
        const { rows: tentativas } = await testDb().query<{ uma_vez: number; com_erro: number }>(
          `SELECT count(*) FILTER (WHERE delivered_at IS NOT NULL AND delivery_attempts = 1) AS uma_vez,
                  count(*) FILTER (WHERE last_error IS NOT NULL) AS com_erro
             FROM payment_attempts WHERE id = ANY($1::text[])`,
          [ids],
        );
        expect(tentativas).toEqual([{ uma_vez: 60, com_erro: 0 }]);

        // Mais uma rodada paralela não entrega nada de novo.
        const [sa, sb] = await Promise.all([a.processarVencidas(), b.processarVencidas()]);
        expect(sa.entregues + sb.entregues + sa.falhas + sb.falhas).toBe(0);
      }
    } finally {
      await outroProcesso.end();
    }
  });
});
