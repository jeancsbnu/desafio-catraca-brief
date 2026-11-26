import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadOrder } from '../../src/features/gateway/index.js';
import { ErroGateway, type EntregaResultado } from '../../src/features/gateway/public.js';
import { createTestApp } from '../helpers/app.js';
import { testDb } from '../helpers/db.js';
import { aguardarEntrega, vencerTentativas } from '../helpers/gateway.js';

// Tabela auxiliar onde os tratadores de exemplo gravam o "efeito" (o que a F05 faria no ingresso).
const EFEITOS = 'f03_teste.efeitos';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function efeitos(): Promise<{ referencia: string; resultado: string; tentativa: number }[]> {
  const { rows } = await testDb().query<{ referencia: string; resultado: string; tentativa: number }>(
    `SELECT referencia, resultado, tentativa FROM ${EFEITOS} ORDER BY referencia`,
  );
  return rows;
}

async function linha(id: string) {
  const { rows } = await testDb().query<{
    delivered: boolean;
    delivery_attempts: number;
    last_error: string | null;
    espera: number;
  }>(
    `SELECT delivered_at IS NOT NULL AS delivered, delivery_attempts, last_error,
            EXTRACT(EPOCH FROM next_delivery_at - updated_at)::float8 AS espera
       FROM payment_attempts WHERE id = $1`,
    [id],
  );
  return rows[0];
}

beforeAll(async () => {
  await testDb().query(
    `CREATE SCHEMA IF NOT EXISTS f03_teste;
     CREATE TABLE IF NOT EXISTS ${EFEITOS} (
       referencia text PRIMARY KEY, resultado text NOT NULL, tentativa integer NOT NULL)`,
  );
});

beforeEach(async () => {
  await testDb().query(`TRUNCATE ${EFEITOS}`);
});

afterAll(async () => {
  await testDb().query('DROP SCHEMA IF EXISTS f03_teste CASCADE');
});

describe('F03 worker: varredura, tratadores e ciclo de vida', () => {
  it('não entrega antes do prazo', async () => {
    const { app } = await createTestApp();
    app.gateway.aoReceberResultado(async () => {});
    const compra = await app.gateway.solicitarAutorizacao({ referencia: 'tkt_cedo', numeroCartao: '4000000000000001' });
    const diagnostico = await app.gateway.solicitarDiagnostico('4000000000000002');

    expect(await app.gateway.processarVencidas()).toEqual({ entregues: 0, falhas: 0 });
    for (const id of [compra.tentativaId, diagnostico.tentativaId]) {
      expect(await app.gateway.consultarTentativa(id)).toMatchObject({
        entregueEm: null,
        tentativasDeEntrega: 0,
        resultado: null,
      });
    }
  });

  it('entrega a tentativa vencida ao tratador com a transação e marca delivered_at no mesmo commit', async () => {
    const { app, db } = await createTestApp();
    const recebidas: EntregaResultado[] = [];
    let efeitoVistoDeFora = -1;
    app.gateway.aoReceberResultado(async (entrega, transacao) => {
      recebidas.push(entrega);
      await transacao.query(
        `INSERT INTO ${EFEITOS} (referencia, resultado, tentativa) VALUES ($1, $2, $3)`,
        [entrega.referencia, entrega.resultado, entrega.tentativaDeEntrega],
      );
      // Outra conexão ainda não vê o efeito: ele só existe no commit da entrega.
      const { rows } = await db.query<{ n: number }>(`SELECT count(*) AS n FROM ${EFEITOS}`);
      efeitoVistoDeFora = rows[0]?.n ?? -1;
    });

    const solicitacao = await app.gateway.solicitarAutorizacao({
      referencia: 'tkt_entrega',
      numeroCartao: '4000000000000001',
    });
    expect(await vencerTentativas(db)).toBe(1);
    expect(await app.gateway.processarVencidas()).toEqual({ entregues: 1, falhas: 0 });

    expect(recebidas).toEqual([
      {
        tentativaId: solicitacao.tentativaId,
        referencia: 'tkt_entrega',
        resultado: 'aprovado',
        finalCartao: '0001',
        solicitadoEm: solicitacao.solicitadoEm,
        prazo: solicitacao.solicitadoEm, // vencerTentativas: prazo = solicitação
        tentativaDeEntrega: 1,
      },
    ]);
    expect(efeitoVistoDeFora).toBe(0);
    expect(await efeitos()).toEqual([{ referencia: 'tkt_entrega', resultado: 'aprovado', tentativa: 1 }]);

    // A marca e o efeito foram gravados pela mesma transação (mesmo xmin nas duas linhas).
    const { rows } = await db.query<{ mesma_transacao: boolean }>(
      `SELECT (SELECT xmin::text FROM payment_attempts WHERE id = $1)
            = (SELECT xmin::text FROM ${EFEITOS} WHERE referencia = 'tkt_entrega') AS mesma_transacao`,
      [solicitacao.tentativaId],
    );
    expect(rows).toEqual([{ mesma_transacao: true }]);
    expect(await app.gateway.consultarTentativa(solicitacao.tentativaId)).toMatchObject({
      tentativasDeEntrega: 1,
      ultimoErro: null,
      resultado: 'aprovado',
      entregueEm: expect.any(Date) as Date,
    });

    // Entregue uma vez: novas varreduras não chamam o tratador de novo.
    expect(await app.gateway.processarVencidas()).toEqual({ entregues: 0, falhas: 0 });
    expect(recebidas).toHaveLength(1);
  });

  it('erro no tratador desfaz o efeito, grava last_error e reentrega na varredura seguinte uma única vez', async () => {
    const { app, db } = await createTestApp();
    let chamadas = 0;
    app.gateway.aoReceberResultado(async (entrega, transacao) => {
      chamadas += 1;
      await transacao.query(
        `INSERT INTO ${EFEITOS} (referencia, resultado, tentativa) VALUES ($1, $2, $3)`,
        [entrega.referencia, entrega.resultado, entrega.tentativaDeEntrega],
      );
      if (chamadas === 1) throw new Error('falha simulada no tratador');
    });
    const solicitacao = await app.gateway.solicitarAutorizacao({
      referencia: 'tkt_falha',
      numeroCartao: '4000000000000002',
    });
    await vencerTentativas(db);

    expect(await app.gateway.processarVencidas()).toEqual({ entregues: 0, falhas: 1 });
    expect(await efeitos()).toEqual([]);
    const depoisDaFalha = await linha(solicitacao.tentativaId);
    expect(depoisDaFalha).toMatchObject({
      delivered: false,
      delivery_attempts: 1,
      last_error: 'falha simulada no tratador',
    });
    expect(depoisDaFalha?.espera).toBeGreaterThan(0.19);
    expect(depoisDaFalha?.espera).toBeLessThan(0.21);

    // Antes da espera de 0,2 s, a tentativa não volta.
    expect(await app.gateway.processarVencidas()).toEqual({ entregues: 0, falhas: 0 });
    await sleep(250);
    expect(await app.gateway.processarVencidas()).toEqual({ entregues: 1, falhas: 0 });
    expect(await efeitos()).toEqual([{ referencia: 'tkt_falha', resultado: 'recusado', tentativa: 2 }]);
    expect(await linha(solicitacao.tentativaId)).toMatchObject({
      delivered: true,
      delivery_attempts: 2,
      last_error: null,
    });

    expect(await app.gateway.processarVencidas()).toEqual({ entregues: 0, falhas: 0 });
    expect(chamadas).toBe(2);
  });

  it('falhas seguidas do tratador aumentam a espera até 5 s', async () => {
    const { app, db } = await createTestApp();
    app.gateway.aoReceberResultado(async () => {
      throw new Error('sempre falha');
    });
    const solicitacao = await app.gateway.solicitarAutorizacao({ referencia: 'tkt_espera', numeroCartao: '4000000000000001' });
    const esperas: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      // Força a tentativa a vencer de novo para medir a espera calculada a cada falha.
      await db.query('UPDATE payment_attempts SET due_at = requested_at, next_delivery_at = requested_at WHERE id = $1', [
        solicitacao.tentativaId,
      ]);
      expect(await app.gateway.processarVencidas()).toEqual({ entregues: 0, falhas: 1 });
      esperas.push(Math.round(((await linha(solicitacao.tentativaId))?.espera ?? 0) * 10) / 10);
    }
    expect(esperas).toEqual([0.2, 0.4, 0.8, 1.6, 3.2, 5, 5]);
    expect(await linha(solicitacao.tentativaId)).toMatchObject({ delivered: false, delivery_attempts: 7 });
  });

  it('sem tratador registrado, tentativas de compra ficam pendentes sem contar tentativa de entrega', async () => {
    const { app, db } = await createTestApp();
    const solicitacao = await app.gateway.solicitarAutorizacao({
      referencia: 'tkt_sem_tratador',
      numeroCartao: '4000000000000001',
    });
    await vencerTentativas(db);

    expect(await app.gateway.processarVencidas()).toEqual({ entregues: 0, falhas: 0 });
    expect(await app.gateway.consultarTentativa(solicitacao.tentativaId)).toMatchObject({
      entregueEm: null,
      tentativasDeEntrega: 0,
      ultimoErro: null,
    });

    const referencias: string[] = [];
    app.gateway.aoReceberResultado(async (entrega) => {
      referencias.push(entrega.referencia);
    });
    expect(await app.gateway.processarVencidas()).toEqual({ entregues: 1, falhas: 0 });
    expect(referencias).toEqual(['tkt_sem_tratador']);
    expect(await app.gateway.consultarTentativa(solicitacao.tentativaId)).toMatchObject({ tentativasDeEntrega: 1 });
  });

  it('tentativas de diagnóstico são entregues pelo tratador interno sem tratador de compra', async () => {
    const { app, db } = await createTestApp();
    const diagnostico = await app.gateway.solicitarDiagnostico('4000000000000009');
    const compra = await app.gateway.solicitarAutorizacao({ referencia: 'tkt_espera', numeroCartao: '4000000000000001' });
    await vencerTentativas(db);

    expect(await app.gateway.processarVencidas()).toEqual({ entregues: 1, falhas: 0 });
    expect(await app.gateway.consultarTentativa(diagnostico.tentativaId)).toMatchObject({
      origem: 'diagnostico',
      resultado: 'recusado',
      finalCartao: '0009',
      tentativasDeEntrega: 1,
      entregueEm: expect.any(Date) as Date,
    });
    expect(await app.gateway.consultarTentativa(compra.tentativaId)).toMatchObject({ entregueEm: null });
  });

  it('aoReceberResultado recusa um segundo tratador', async () => {
    const { app } = await createTestApp();
    app.gateway.aoReceberResultado(async () => {});
    let erro: unknown;
    try {
      app.gateway.aoReceberResultado(async () => {});
    } catch (capturado) {
      erro = capturado;
    }
    expect(erro).toBeInstanceOf(ErroGateway);
    expect(erro).toMatchObject({
      codigo: 'tratador_ja_registrado',
      message: 'Já existe um tratador de resultado registrado no gateway',
    });
  });

  it('pararWorker espera a entrega em andamento terminar', async () => {
    const { app, db } = await createTestApp();
    let avisarInicio: () => void = () => {};
    const comecou = new Promise<void>((resolve) => {
      avisarInicio = resolve;
    });
    app.gateway.aoReceberResultado(async (entrega, transacao) => {
      avisarInicio();
      await sleep(300);
      await transacao.query(
        `INSERT INTO ${EFEITOS} (referencia, resultado, tentativa) VALUES ($1, $2, $3)`,
        [entrega.referencia, entrega.resultado, entrega.tentativaDeEntrega],
      );
    });
    const lenta = await app.gateway.solicitarAutorizacao({ referencia: 'tkt_lenta', numeroCartao: '4000000000000001' });
    await vencerTentativas(db);

    app.gateway.iniciarWorker({ intervaloMs: 20 });
    await comecou;
    const inicio = performance.now();
    await app.gateway.pararWorker();
    expect(performance.now() - inicio).toBeGreaterThan(200);
    expect(await app.gateway.consultarTentativa(lenta.tentativaId)).toMatchObject({ tentativasDeEntrega: 1 });
    expect(await efeitos()).toHaveLength(1);

    // Parado, o worker não entrega mais nada; pararWorker de novo não faz nada.
    const depois = await app.gateway.solicitarAutorizacao({ referencia: 'tkt_depois', numeroCartao: '4000000000000001' });
    await vencerTentativas(db);
    await sleep(150);
    expect(await app.gateway.consultarTentativa(depois.tentativaId)).toMatchObject({ entregueEm: null });
    await app.gateway.pararWorker();
  });

  it('o worker só inicia com backgroundJobs e para no close da aplicação', async () => {
    const semWorker = await createTestApp();
    await semWorker.app.ready();
    const pendente = await semWorker.app.gateway.solicitarDiagnostico('4000000000000001');
    await vencerTentativas(semWorker.db);
    await sleep(500);
    expect(await semWorker.app.gateway.consultarTentativa(pendente.tentativaId)).toMatchObject({ entregueEm: null });

    // Com backgroundJobs, a aplicação entrega sozinha (inclusive o que já estava vencido).
    const comWorker = await createTestApp({ backgroundJobs: true });
    await comWorker.app.ready();
    await aguardarEntrega(comWorker.db, pendente.tentativaId, { timeoutMs: 1500 });
    const nova = await comWorker.app.gateway.solicitarDiagnostico('4000000000000002');
    await vencerTentativas(comWorker.db);
    await aguardarEntrega(comWorker.db, nova.tentativaId, { timeoutMs: 1500 });

    // Depois do close, nada mais é entregue.
    await comWorker.app.close();
    const aposClose = await comWorker.app.gateway.solicitarDiagnostico('4000000000000001');
    await vencerTentativas(comWorker.db);
    await sleep(500);
    expect(await comWorker.app.gateway.consultarTentativa(aposClose.tentativaId)).toMatchObject({ entregueEm: null });
  });

  it('o módulo carrega com loadOrder 20 e decora app.gateway', async () => {
    const { app } = await createTestApp();
    expect(loadOrder).toBe(20);
    expect(app.featureModules).toEqual(expect.arrayContaining(['gateway', 'health', 'vitrine']));
    // loadOrder 20: antes dos módulos com o padrão (100).
    expect(app.featureModules.indexOf('gateway')).toBeLessThan(app.featureModules.indexOf('health'));
    expect(app.gateway.modo).toBe('simulado');
    expect(app.gateway.escala).toBe(1);
    expect(app.hasDecorator('gateway')).toBe(true);
  });
});
