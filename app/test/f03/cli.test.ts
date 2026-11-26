import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/index.js';
import { createTestApp } from '../helpers/app.js';
import { testDb } from '../helpers/db.js';

const LINHA_SOLICITACAO =
  /^solicitação (pay_[a-z0-9]{16}) registrada em [0-9]+,[0-9] s \(cartão final ([0-9]{4}), modo simulado, escala ([0-9.]+)\)$/;
const LINHA_RESULTADO = /^(aprovado|recusado) em ([0-9]+,[0-9]) s$/;
const USO = 'Uso: catraca gateway:simular <número do cartão com 16 dígitos> [--sem-esperar]';
const CARTAO_INVALIDO = 'Número de cartão inválido: informe exatamente 16 dígitos (ex.: 4000000000000001).';

interface Execucao {
  code: number;
  out: string[];
  err: string[];
  ms: number;
}

async function simular(
  argv: string[],
  opcoes: { escala?: string; env?: Record<string, string>; aoImprimir?: (linha: string) => void } = {},
): Promise<Execucao> {
  const out: string[] = [];
  const err: string[] = [];
  const inicio = performance.now();
  const code = await runCli(['gateway:simular', ...argv], {
    env: { ...process.env, NODE_ENV: 'test', GATEWAY_DELAY_SCALE: opcoes.escala ?? '0.01', ...opcoes.env },
    stdout: (linha) => {
      out.push(linha);
      opcoes.aoImprimir?.(linha);
    },
    stderr: (linha) => err.push(linha),
  });
  return { code, out, err, ms: performance.now() - inicio };
}

async function contarTentativas(): Promise<number> {
  const { rows } = await testDb().query<{ n: number }>('SELECT count(*) AS n FROM payment_attempts');
  return rows[0]?.n ?? -1;
}

async function appComWorker() {
  const testApp = await createTestApp();
  testApp.app.gateway.iniciarWorker({ intervaloMs: 20 });
  return testApp;
}

describe('F03 catraca gateway:simular', () => {
  it('F03-CA01 gateway:simular imprime a solicitação na hora e o resultado no formato literal', async () => {
    await appComWorker();
    let pendenteNaLinha1: Promise<boolean> | undefined;
    const execucao = await simular(['4000000000000001'], {
      escala: '0.1', // final 0001: 220–400 ms
      aoImprimir: (linha) => {
        const id = LINHA_SOLICITACAO.exec(linha)?.[1];
        if (id !== undefined && pendenteNaLinha1 === undefined) {
          // No instante em que a linha 1 é impressa, o resultado ainda não existe.
          pendenteNaLinha1 = testDb()
            .query<{ pendente: boolean }>('SELECT delivered_at IS NULL AS pendente FROM payment_attempts WHERE id = $1', [id])
            .then(({ rows }) => rows[0]?.pendente === true);
        }
      },
    });

    expect(execucao.err).toEqual([]);
    expect(execucao.code).toBe(0);
    expect(execucao.out).toHaveLength(2);
    expect(await pendenteNaLinha1).toBe(true);

    const [linha1 = '', linha2 = ''] = execucao.out;
    const solicitacao = LINHA_SOLICITACAO.exec(linha1);
    expect(solicitacao?.slice(2)).toEqual(['0001', '0.1']);
    expect(linha1).toMatch(/ registrada em 0,[0-9] s /);
    const resultado = LINHA_RESULTADO.exec(linha2);
    expect(resultado?.[1]).toBe('aprovado');

    // O tempo impresso é delivered_at − requested_at (relógio do banco), com uma casa decimal.
    const { rows } = await testDb().query<{ tempo: string }>(
      `SELECT replace(round(round(EXTRACT(EPOCH FROM delivered_at - requested_at), 3), 1)::text, '.', ',') AS tempo
         FROM payment_attempts WHERE id = $1`,
      [solicitacao?.[1]],
    );
    expect(rows).toEqual([{ tempo: resultado?.[2] }]);
  });

  it('gateway:simular --sem-esperar imprime só a solicitação e sai com 0', async () => {
    for (const argv of [
      ['4000000000000003', '--sem-esperar'],
      ['--sem-esperar', '4000000000000004'],
    ]) {
      const execucao = await simular(argv);
      expect(execucao.code).toBe(0);
      expect(execucao.err).toEqual([]);
      expect(execucao.out).toHaveLength(1);
      const id = LINHA_SOLICITACAO.exec(execucao.out[0] ?? '')?.[1];
      expect(id).toBeDefined();
      const { rows } = await testDb().query<{ pendente: boolean; origin: string }>(
        'SELECT delivered_at IS NULL AS pendente, origin FROM payment_attempts WHERE id = $1',
        [id],
      );
      expect(rows).toEqual([{ pendente: true, origin: 'diagnostico' }]);
    }
  });

  it('F03-CA07 gateway:simular nunca mostra o número completo do cartão', async () => {
    await appComWorker();
    const numero = '4000123456780002';
    const execucao = await simular([numero]);
    expect(execucao.code).toBe(0);
    expect(execucao.out[0]).toContain('cartão final 0002');
    expect(execucao.out[1]).toMatch(/^recusado em /);

    const invalido = await simular([`${numero}9`]);
    expect(invalido.code).toBe(2);
    for (const texto of [...execucao.out, ...execucao.err, ...invalido.out, ...invalido.err]) {
      expect(texto).not.toContain('400012345678');
    }
  });

  it('gateway:simular sem argumento ou com cartão inválido sai com 2 sem gravar tentativa', async () => {
    const casos: [string[], string][] = [
      [[], USO],
      [['400000000000001'], CARTAO_INVALIDO],
      [['40000000000000011'], CARTAO_INVALIDO],
      [['4000a00000000001'], CARTAO_INVALIDO],
      [['4000000000000001', '--rapido'], USO],
      [['4000000000000001', '4000000000000002'], USO],
      [['--sem-esperar'], USO],
    ];
    for (const [argv, mensagem] of casos) {
      const execucao = await simular(argv);
      expect({ argv, code: execucao.code, out: execucao.out, err: execucao.err }).toEqual({
        argv,
        code: 2,
        out: [],
        err: [mensagem],
      });
    }
    expect(await contarTentativas()).toBe(0);
  });

  it('gateway:simular sem worker no ar sai com 1 depois do limite', async () => {
    // Escala 0,01: limite de max(60 s × 0,01, 2 s) = 2 s.
    const execucao = await simular(['4000000000000003']);
    expect(execucao.code).toBe(1);
    expect(execucao.out).toHaveLength(1);
    expect(execucao.err).toHaveLength(1);
    expect(execucao.err[0]).toMatch(
      /^sem resultado em 2,[0-9] s: a tentativa pay_[a-z0-9]{16} continua pendente \(o worker roda no processo da aplicação; ela está no ar\?\)$/,
    );
    expect(execucao.ms).toBeGreaterThanOrEqual(1900);
    expect(execucao.ms).toBeLessThan(3500);
  });

  it('gateway:simular com erro inesperado sai com 1 e mostra Erro: <mensagem>', async () => {
    const execucao = await simular(['4000000000000001'], {
      env: { DATABASE_URL: 'postgres://catraca:catraca@127.0.0.1:1/catraca_test' },
    });
    expect(execucao.code).toBe(1);
    expect(execucao.out).toEqual([]);
    expect(execucao.err).toHaveLength(1);
    expect(execucao.err[0]).toMatch(/^Erro: .+/);
  });

  it('catraca help lista gateway:simular', async () => {
    const out: string[] = [];
    const code = await runCli(['help'], { stdout: (linha) => out.push(linha), stderr: () => {} });
    expect(code).toBe(0);
    expect(
      out.filter((linha) => /^\s+gateway:simular\s+Simula um pagamento no gateway e mostra o resultado e o tempo$/.test(linha)),
    ).toHaveLength(1);
  });
});
