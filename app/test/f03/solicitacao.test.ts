import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import type { Queryable } from '../../src/db/pool.js';
import { withTransaction } from '../../src/db/transaction.js';
import { criarGatewaySimulado, ErroGateway } from '../../src/features/gateway/public.js';
import { testDb } from '../helpers/db.js';

function gateway() {
  return criarGatewaySimulado({ db: testDb(), config: loadConfig({ NODE_ENV: 'test' }) });
}

async function contarTentativas(): Promise<number> {
  const { rows } = await testDb().query<{ n: number }>('SELECT count(*) AS n FROM payment_attempts');
  return rows[0]?.n ?? -1;
}

async function codigoDoErro(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (error) {
    expect(error).toBeInstanceOf(ErroGateway);
    return (error as ErroGateway).codigo;
  }
  throw new Error('era esperado um ErroGateway');
}

/** Executor que falha em qualquer SQL: prova que a validação acontece antes do banco. */
const bancoProibido = {
  query: () => {
    throw new Error('o banco não devia ser consultado');
  },
} as unknown as Queryable;

describe('F03 solicitação de autorização', () => {
  it('solicitarAutorizacao retorna em menos de 200 ms sem esperar o resultado', async () => {
    const gw = gateway();
    await testDb().query('SELECT 1');
    const inicio = performance.now();
    const solicitacao = await gw.solicitarAutorizacao({ referencia: 'tkt_rapido', numeroCartao: '4000000000000003' });
    const duracao = performance.now() - inicio;

    expect(duracao).toBeLessThan(200);
    expect(Object.keys(solicitacao).sort()).toEqual(['finalCartao', 'prazo', 'referencia', 'solicitadoEm', 'tentativaId']);
    expect(solicitacao).not.toHaveProperty('resultado');
    const { rows } = await testDb().query<{ pendente: boolean }>(
      'SELECT delivered_at IS NULL AS pendente FROM payment_attempts WHERE id = $1',
      [solicitacao.tentativaId],
    );
    expect(rows).toEqual([{ pendente: true }]);
  });

  it('grava referência, origem compra, final do cartão, resultado, atraso e prazo = requested_at + atraso', async () => {
    const solicitacao = await gateway().solicitarAutorizacao({
      referencia: 'tkt_abc123',
      numeroCartao: '4000000000000001',
    });
    expect(solicitacao.tentativaId).toMatch(/^pay_[a-z0-9]{16}$/);
    expect(solicitacao.referencia).toBe('tkt_abc123');
    expect(solicitacao.finalCartao).toBe('0001');

    const { rows } = await testDb().query<{
      origin: string;
      reference: string;
      card_last4: string;
      result: string;
      delay_ms: number;
      requested_at: Date;
      due_at: Date;
      prazo_ok: boolean;
      proxima_ok: boolean;
      delivered_at: Date | null;
      delivery_attempts: number;
      last_error: string | null;
    }>(
      `SELECT origin, reference, card_last4, result, delay_ms, requested_at, due_at,
              due_at - requested_at = delay_ms * interval '1 millisecond' AS prazo_ok,
              next_delivery_at = due_at AS proxima_ok,
              delivered_at, delivery_attempts, last_error
         FROM payment_attempts WHERE id = $1`,
      [solicitacao.tentativaId],
    );
    const linha = rows[0];
    expect(linha).toMatchObject({
      origin: 'compra',
      reference: 'tkt_abc123',
      card_last4: '0001',
      result: 'aprovado',
      prazo_ok: true,
      proxima_ok: true,
      delivered_at: null,
      delivery_attempts: 0,
      last_error: null,
    });
    expect(linha?.delay_ms).toBeGreaterThanOrEqual(2200);
    expect(linha?.delay_ms).toBeLessThanOrEqual(4000);
    expect(solicitacao.solicitadoEm.getTime()).toBe(linha?.requested_at.getTime());
    expect(solicitacao.prazo.getTime()).toBe(linha?.due_at.getTime());
  });

  it('F03-CA07 nunca grava o número completo do cartão', async () => {
    const numero = '4000123456780001';
    const solicitacao = await gateway().solicitarAutorizacao({ referencia: 'tkt_cartao', numeroCartao: numero });
    const db = testDb();

    const { rows } = await db.query<{ card_last4: string }>('SELECT card_last4 FROM payment_attempts WHERE id = $1', [
      solicitacao.tentativaId,
    ]);
    expect(rows).toEqual([{ card_last4: '0001' }]);

    const { rows: vazamentos } = await db.query<{ n: number }>(
      `SELECT count(*) AS n FROM payment_attempts t WHERE t::text LIKE $1 OR t::text ~ '[0-9]{16}'`,
      [`%${numero.slice(0, 12)}%`],
    );
    expect(vazamentos).toEqual([{ n: 0 }]);

    for (const invalido of ['12345', numero, '123', 'abcd']) {
      await expect(
        db.query('UPDATE payment_attempts SET card_last4 = $1 WHERE id = $2', [invalido, solicitacao.tentativaId]),
      ).rejects.toMatchObject({ code: '23514', constraint: 'payment_attempts_card_last4_format' });
    }
  });

  it('com a transação do chamador a tentativa só aparece depois do commit e some no rollback', async () => {
    const gw = gateway();
    const db = testDb();

    let vistaDeFora = -1;
    const solicitacao = await withTransaction(db, async (client) => {
      const registrada = await gw.solicitarAutorizacao(
        { referencia: 'tkt_commit', numeroCartao: '4000000000000002' },
        { transacao: client },
      );
      vistaDeFora = await contarTentativas();
      return registrada;
    });
    expect(vistaDeFora).toBe(0);
    expect(await contarTentativas()).toBe(1);
    expect(await gw.consultarTentativa(solicitacao.tentativaId)).toMatchObject({
      referencia: 'tkt_commit',
      origem: 'compra',
      entregueEm: null,
      resultado: null,
    });

    await expect(
      withTransaction(db, async (client) => {
        await gw.solicitarAutorizacao({ referencia: 'tkt_rollback', numeroCartao: '4000000000000002' }, { transacao: client });
        throw new Error('compra desfeita');
      }),
    ).rejects.toThrow('compra desfeita');
    expect(await contarTentativas()).toBe(1);
  });

  it('recusa cartão sem 16 dígitos e referência inválida sem gravar nada', async () => {
    const gw = gateway();
    for (const numeroCartao of ['400000000000001', '40000000000000011', '4000a00000000001', '', ' 4000000000000001']) {
      expect(
        await codigoDoErro(gw.solicitarAutorizacao({ referencia: 'tkt_ok', numeroCartao }, { transacao: bancoProibido })),
      ).toBe('cartao_invalido');
    }
    for (const referencia of ['', 'com espaço', 'x'.repeat(65), 'ação', "tkt'1"]) {
      expect(
        await codigoDoErro(
          gw.solicitarAutorizacao({ referencia, numeroCartao: '4000000000000001' }, { transacao: bancoProibido }),
        ),
      ).toBe('referencia_invalida');
    }
    expect(await codigoDoErro(gw.solicitarDiagnostico('123'))).toBe('cartao_invalido');
    expect(await contarTentativas()).toBe(0);

    const erro = new ErroGateway('cartao_invalido');
    expect(erro.name).toBe('ErroGateway');
    expect(erro.message).toBe('Número de cartão inválido: são necessários 16 dígitos');
    expect(new ErroGateway('referencia_invalida').message).toBe('Referência de pagamento inválida');
    expect(new ErroGateway('referencia_duplicada').message).toBe('Já existe uma tentativa de pagamento para esta referência');
    expect(new ErroGateway('tratador_ja_registrado').message).toBe('Já existe um tratador de resultado registrado no gateway');
  });

  it('recusa segunda tentativa para a mesma referência', async () => {
    const gw = gateway();
    await gw.solicitarAutorizacao({ referencia: 'tkt_repetido', numeroCartao: '4000000000000001' });
    expect(
      await codigoDoErro(gw.solicitarAutorizacao({ referencia: 'tkt_repetido', numeroCartao: '4000000000000002' })),
    ).toBe('referencia_duplicada');
    expect(await contarTentativas()).toBe(1);

    const diagnostico = await gw.solicitarDiagnostico('4000000000000009');
    expect(diagnostico.referencia).toMatch(/^sim_[a-z0-9]{16}$/);
    expect(await gw.consultarTentativa(diagnostico.tentativaId)).toMatchObject({ origem: 'diagnostico', finalCartao: '0009' });
  });

  it('a migration cria payment_attempts com as restrições e o índice parcial', async () => {
    const db = testDb();
    const { rows: restricoes } = await db.query<{ conname: string }>(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'payment_attempts'::regclass ORDER BY conname",
    );
    expect(restricoes.map((r) => r.conname)).toEqual([
      'payment_attempts_attempts_check',
      'payment_attempts_card_last4_format',
      'payment_attempts_delay_check',
      'payment_attempts_delivered_check',
      'payment_attempts_due_check',
      'payment_attempts_id_format',
      'payment_attempts_next_check',
      'payment_attempts_origin_check',
      'payment_attempts_pkey',
      'payment_attempts_reference_format',
      'payment_attempts_result_check',
    ]);

    const { rows: indices } = await db.query<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'payment_attempts' ORDER BY indexname",
    );
    expect(indices.map((i) => i.indexname)).toEqual([
      'payment_attempts_origin_reference_key',
      'payment_attempts_pending_idx',
      'payment_attempts_pkey',
    ]);
    expect(indices.find((i) => i.indexname === 'payment_attempts_origin_reference_key')?.indexdef).toMatch(
      /^CREATE UNIQUE INDEX .* \(origin, reference\)$/,
    );
    expect(indices.find((i) => i.indexname === 'payment_attempts_pending_idx')?.indexdef).toMatch(
      /\(next_delivery_at\) WHERE \(delivered_at IS NULL\)$/,
    );

    const { rows: colunas } = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'payment_attempts' ORDER BY ordinal_position",
    );
    expect(colunas.map((c) => c.column_name)).toEqual([
      'id',
      'origin',
      'reference',
      'card_last4',
      'result',
      'delay_ms',
      'requested_at',
      'due_at',
      'next_delivery_at',
      'delivered_at',
      'delivery_attempts',
      'last_error',
      'updated_at',
    ]);
  });
});
