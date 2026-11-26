// Comandos de diagnóstico da F05 (spec 5.9, 5.10), pelo runCli da F01 contra o banco de teste.
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/index.js';
import { withTransaction } from '../../src/db/transaction.js';
import { lockEventForUpdate } from '../../src/features/eventos/public.js';
import { createTestApp } from '../helpers/app.js';
import { testDb } from '../helpers/db.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { insertTestTicket, settlePayments } from '../helpers/tickets.js';
import { countRows } from './support.js';

const USO_COMPRA =
  'Uso: catraca compra:simular --evento <id> --cartao <número> [--email <e-mail> | --conta <e-mail de participante>] [--paralelas <1 a 50>]';
const USO_CONSULTA = 'Uso: catraca ingresso:consultar <id do ingresso (tkt_…) ou código>';
const CRIADA = /^compra ([0-9]+)\/([0-9]+): criada (tkt_[a-z0-9]{16}) código ([A-Z0-9]{8}) status pending valor ([0-9]+) em [0-9]+,[0-9]{2} s$/;
const RECUSADA = /^compra [0-9]+\/[0-9]+: recusada (invalid_request|event_not_available|sold_out) em [0-9]+,[0-9]{2} s$/;
const ISO = /^-?[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}-03:00$/;

interface Execution {
  code: number;
  out: string[];
  err: string[];
}

async function cli(...argv: string[]): Promise<Execution> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, {
    env: { ...process.env, NODE_ENV: 'test' },
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
  return { code, out, err };
}

async function setup(capacity = 5, status: 'rascunho' | 'publicado' | 'cancelado' = 'publicado') {
  const accounts = await seedAccounts();
  const event = await insertTestEvent(testDb(), { organizerId: accounts.organizadorA.id, capacity, status });
  return { ...accounts, event };
}

describe('F05 catraca compra:simular', () => {
  it('F05-CA01 compra:simular imprime cabeçalho, compra criada, resumo e vagas no formato literal', async () => {
    const { event } = await setup(5);
    const { code, out, err } = await cli('compra:simular', '--evento', event.id, '--cartao', '4000000000000001');
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(`simulando 1 compra(s) simultânea(s) no evento ${event.id} pelo canal api`);
    const match = CRIADA.exec(out[1] ?? '');
    expect(match?.slice(1, 3)).toEqual(['1', '1']);
    expect(match?.[5]).toBe('10000');
    expect(out[2]).toBe('resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0');
    expect(out[3]).toBe('vagas: lotação 5, ocupadas 1, disponíveis 4 (evento publicado)');
    const { rows } = await testDb().query<{ id: string; code: string; buyer_email: string; channel: string }>(
      'SELECT id, code, buyer_email, channel FROM tickets',
    );
    expect(rows).toEqual([{ id: match?.[3], code: match?.[4], buyer_email: 'simulacao-1@example.com', channel: 'api' }]);
  });

  it('F05-CA05 compra:simular --paralelas 30 em lotação 5 imprime 5 criadas e 25 sold_out', async () => {
    const accounts = await seedAccounts();
    for (let round = 1; round <= 3; round += 1) {
      const event = await insertTestEvent(testDb(), { organizerId: accounts.organizadorA.id, capacity: 5, priceCents: 1000 });
      const { code, out } = await cli('compra:simular', '--paralelas', '30', '--cartao', '4000000000000001', '--evento', event.id);
      expect(code).toBe(0);
      const lines = out.filter((line) => line.startsWith('compra '));
      expect(lines).toHaveLength(30);
      lines.forEach((line, index) => expect(line.startsWith(`compra ${index + 1}/30: `)).toBe(true));
      expect(lines.filter((line) => CRIADA.test(line))).toHaveLength(5);
      expect(lines.filter((line) => RECUSADA.exec(line)?.[1] === 'sold_out')).toHaveLength(25);
      expect(out.at(-2)).toBe('resumo: criadas 5, sold_out 25, event_not_available 0, invalid_request 0, erros 0');
      expect(out.at(-1)).toBe('vagas: lotação 5, ocupadas 5, disponíveis 0 (evento publicado)');
      expect(await countRows(testDb(), 'tickets', event.id)).toBe(5);
      const { rows } = await testDb().query<{ emails: number }>(
        'SELECT count(DISTINCT buyer_email) AS emails FROM tickets WHERE event_id = $1',
        [event.id],
      );
      expect(rows[0]?.emails).toBe(5);
    }
  });

  it('compra:simular --conta compra pelo canal vitrine com a conta do participante', async () => {
    const { event, participante } = await setup(5);
    const { code, out } = await cli(
      'compra:simular',
      '--evento',
      event.id,
      '--cartao',
      '4000000000000001',
      '--conta',
      'PARTICIPANTE@catraca.test',
      '--paralelas',
      '2',
    );
    expect(code).toBe(0);
    expect(out[0]).toBe(`simulando 2 compra(s) simultânea(s) no evento ${event.id} pelo canal vitrine`);
    expect(out.filter((line) => CRIADA.test(line))).toHaveLength(2);
    const { rows } = await testDb().query<{ channel: string; buyer_user_id: string; buyer_email: string }>(
      'SELECT DISTINCT channel, buyer_user_id, buyer_email FROM tickets',
    );
    expect(rows).toEqual([{ channel: 'vitrine', buyer_user_id: participante.id, buyer_email: 'participante@catraca.test' }]);

    const withEmail = await cli('compra:simular', '--evento', event.id, '--cartao', '4000000000000001', '--email', 'Ana@Example.com');
    expect(withEmail.code).toBe(0);
    const { rows: api } = await testDb().query<{ buyer_email: string }>("SELECT buyer_email FROM tickets WHERE channel = 'api'");
    expect(api).toEqual([{ buyer_email: 'ana@example.com' }]);
  });

  it('F05-CA03 compra:simular repassa o cartão sem validar e mostra invalid_request; nunca imprime o número', async () => {
    const { event } = await setup(5);
    for (const card of ['400000000000001', '40000000000000011', '400000000000000A', '4000 0000 0000 0001']) {
      const { code, out, err } = await cli('compra:simular', '--evento', event.id, '--cartao', card, '--paralelas', '2');
      expect(code).toBe(0);
      expect(out.filter((line) => RECUSADA.exec(line)?.[1] === 'invalid_request')).toHaveLength(2);
      expect(out.at(-2)).toBe('resumo: criadas 0, sold_out 0, event_not_available 0, invalid_request 2, erros 0');
      expect([...out, ...err].some((line) => line.includes(card))).toBe(false);
    }
    const ok = await cli('compra:simular', '--evento', event.id, '--cartao', '4000000000000001');
    expect([...ok.out, ...ok.err].some((line) => line.includes('4000000000000001'))).toBe(false);
    const unknownEvent = await cli('compra:simular', '--evento', 'evt_0000000000000000', '--cartao', '4000000000000001');
    expect(unknownEvent.out.slice(1)).toEqual([
      expect.stringMatching(/^compra 1\/1: recusada event_not_available em [0-9]+,[0-9]{2} s$/),
      'resumo: criadas 0, sold_out 0, event_not_available 1, invalid_request 0, erros 0',
      'vagas: evento não encontrado',
    ]);
  });

  it('compra:simular com uso inválido sai com 2 sem gravar nada', async () => {
    const { event } = await setup(5);
    const e = event.id;
    const c = '4000000000000001';
    const invalid: string[][] = [
      [],
      ['--evento', e],
      ['--cartao', c],
      ['--evento', e, '--cartao', c, '--evento', e],
      ['--evento', e, '--cartao', c, '--lotacao', '3'],
      ['--evento', e, '--cartao'],
      ['--evento', '--cartao', c],
      ['--evento', e, '--cartao', c, 'solto'],
      ['--evento', e, '--cartao', c, '--email', 'a@b.c', '--conta', 'participante@catraca.test'],
      ['--evento', e, '--cartao', c, '--paralelas', '0'],
      ['--evento', e, '--cartao', c, '--paralelas', '51'],
      ['--evento', e, '--cartao', c, '--paralelas', 'dez'],
      ['--evento', e, '--cartao', c, '--paralelas', '2.5'],
    ];
    for (const argv of invalid) {
      const { code, out, err } = await cli('compra:simular', ...argv);
      expect(code, argv.join(' ')).toBe(2);
      expect(out).toEqual([]);
      expect(err).toEqual([USO_COMPRA]);
    }
    for (const account of ['organizador.a@catraca.test', 'ninguem@catraca.test']) {
      const { code, out, err } = await cli('compra:simular', '--evento', e, '--cartao', c, '--conta', account);
      expect(code).toBe(2);
      expect(out).toEqual([]);
      expect(err).toEqual([`Conta de participante não encontrada: ${account}`]);
    }
    expect(await countRows(testDb(), 'tickets')).toBe(0);
    expect(await countRows(testDb(), 'payment_attempts')).toBe(0);
  });

  it('compra:simular com erro inesperado imprime erro e sai com 1', async () => {
    const { event } = await setup(5);
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => {};
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const holder = withTransaction(testDb(), async (client) => {
      await lockEventForUpdate(client, event.id);
      locked();
      await released;
    });
    await isLocked;
    let execution: Execution;
    try {
      execution = await cli('compra:simular', '--evento', event.id, '--cartao', '4000000000000001');
    } finally {
      release();
      await holder;
    }
    expect(execution.code).toBe(1);
    expect(execution.out[1]).toMatch(/^compra 1\/1: erro .+ em [0-9]+,[0-9]{2} s$/);
    expect(execution.out[2]).toBe('resumo: criadas 0, sold_out 0, event_not_available 0, invalid_request 0, erros 1');
    expect(await countRows(testDb(), 'tickets')).toBe(0);
  });
});

describe('F05 catraca ingresso:consultar', () => {
  it('ingresso:consultar por id e por código normalizado mostra os campos, o pagamento e as vagas', async () => {
    const { app } = await createTestApp();
    const { event, participante } = await setup(5);
    const bought = await cli('compra:simular', '--evento', event.id, '--cartao', '4000000000000001');
    const match = CRIADA.exec(bought.out[1] ?? '');
    const id = match?.[3] ?? '';
    const code = match?.[4] ?? '';

    const before = await cli('ingresso:consultar', id);
    expect(before.code).toBe(0);
    expect(before.out).toHaveLength(13);
    expect(before.out.slice(0, 9)).toEqual([
      `ingresso: ${id}`,
      `código: ${code}`,
      `evento: ${event.id} (publicado)`,
      'status: pending (pendente)',
      'check-in: não',
      'valor pago: 10000 centavos',
      'canal: api',
      'comprador: simulacao-1@example.com',
      'conta: -',
    ]);
    expect(before.out[9]?.replace('criado em: ', '')).toMatch(ISO);
    expect(before.out[10]?.replace('status desde: ', '')).toMatch(ISO);
    expect(before.out[11]).toMatch(/^pagamento: pay_[a-z0-9]{16} \(cartão final 0001, aguardando o gateway\)$/);
    expect(before.out[12]).toBe('vagas do evento: lotação 5, ocupadas 1, disponíveis 4');

    await settlePayments(app);
    const after = await cli('ingresso:consultar', `  ${code.toLowerCase()}  `);
    expect(after.code).toBe(0);
    expect(after.out[0]).toBe(`ingresso: ${id}`);
    expect(after.out[3]).toBe('status: confirmed (confirmado)');
    expect(after.out[11]).toMatch(
      /^pagamento: pay_[a-z0-9]{16} \(cartão final 0001, aprovado, entregue [0-9]+,[0-9] s após a solicitação\)$/,
    );

    const vitrine = await insertTestTicket(testDb(), {
      eventId: event.id,
      buyerUserId: participante.id,
      status: 'confirmed',
      checkedIn: true,
    });
    const shown = await cli('ingresso:consultar', vitrine.id);
    expect(shown.out[3]).toBe('status: confirmed (confirmado)');
    expect(shown.out[4]).toMatch(/^check-in: sim em -?[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}-03:00$/);
    expect(shown.out[6]).toBe('canal: vitrine');
    expect(shown.out[8]).toBe(`conta: ${participante.id}`);
    expect(shown.out[11]).toBe('pagamento: nenhum');
    expect(shown.out[12]).toBe('vagas do evento: lotação 5, ocupadas 2, disponíveis 3');
  });

  it('ingresso:consultar de ingresso inexistente sai com 1; sem argumento sai com 2', async () => {
    const notFound = await cli('ingresso:consultar', 'ZZZZZZZZ');
    expect(notFound).toEqual({ code: 1, out: [], err: ['Ingresso não encontrado: ZZZZZZZZ'] });
    const lower = await cli('ingresso:consultar', ' zzzzzzzz ');
    expect(lower.err).toEqual(['Ingresso não encontrado: ZZZZZZZZ']);
    const byId = await cli('ingresso:consultar', 'tkt_0000000000000000');
    expect(byId).toEqual({ code: 1, out: [], err: ['Ingresso não encontrado: tkt_0000000000000000'] });
    for (const argv of [[], ['a', 'b']]) {
      expect(await cli('ingresso:consultar', ...argv)).toEqual({ code: 2, out: [], err: [USO_CONSULTA] });
    }
  });

  it('catraca help lista compra:simular e ingresso:consultar', async () => {
    const { code, out } = await cli('help');
    expect(code).toBe(0);
    expect(
      out.filter((line) => /^ {2}compra:simular +Cria uma ou N compras simultâneas num evento e mostra o resultado de cada uma$/.test(line)),
    ).toHaveLength(1);
    expect(out.filter((line) => /^ {2}ingresso:consultar +Mostra um ingresso por id \(tkt_…\) ou código$/.test(line))).toHaveLength(1);
  });
});
