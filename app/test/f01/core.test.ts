import { describe, expect, it } from 'vitest';
import { formatBRL, formatDateTimeBR, toIsoWithOffset } from '../../src/core/format.js';
import { newId } from '../../src/core/ids.js';
import { hashPassword, verifyPassword } from '../../src/core/password.js';
import type { Queryable } from '../../src/db/pool.js';
import { withTransaction } from '../../src/db/transaction.js';
import { testDb } from '../helpers/db.js';

describe('F01 utilitários compartilhados', () => {
  it('newId gera prefixo_ + 16 caracteres [a-z0-9] sem repetir em 10 000 chamadas', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      const id = newId('usr');
      expect(id).toMatch(/^usr_[a-z0-9]{16}$/);
      ids.add(id);
    }
    expect(ids.size).toBe(10_000);
    expect(newId('evt')).toMatch(/^evt_[a-z0-9]{16}$/);
    expect(() => newId('Usr')).toThrow();
  });

  it('hashPassword gera hashes diferentes para a mesma senha e verifyPassword confere', async () => {
    const a = await hashPassword('catraca123');
    const b = await hashPassword('catraca123');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(a).not.toContain('catraca123');
    expect(await verifyPassword('catraca123', a)).toBe(true);
    expect(await verifyPassword('catraca123', b)).toBe(true);
  });

  it('verifyPassword rejeita senha errada e hash malformado sem lançar', async () => {
    const hash = await hashPassword('catraca123');
    expect(await verifyPassword('outra', hash)).toBe(false);
    expect(await verifyPassword('catraca123', '')).toBe(false);
    expect(await verifyPassword('catraca123', 'catraca123')).toBe(false);
    expect(await verifyPassword('catraca123', 'scrypt$abc$8$1$x$y')).toBe(false);
    expect(await verifyPassword('catraca123', 'scrypt$16384$8$1$$')).toBe(false);
    expect(await verifyPassword('catraca123', 'bcrypt$16384$8$1$c2Fs$aGFzaA')).toBe(false);
    expect(await verifyPassword('catraca123', hash.replace(/\$[^$]+$/, '$AAAA'))).toBe(false);
  });

  it('formatBRL usa espaço comum, ponto no milhar e vírgula nos centavos', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(10000)).toBe('R$ 100,00');
    expect(formatBRL(0)).toBe('R$ 0,00');
    expect(formatBRL(5)).toBe('R$ 0,05');
    expect(formatBRL(123456789)).toBe('R$ 1.234.567,89');
    expect(formatBRL(123456)).not.toContain(' ');
  });

  it('formatDateTimeBR mostra dd/mm/aaaa hh:mm no fuso America/Sao_Paulo', () => {
    expect(formatDateTimeBR(new Date('2026-12-06T00:00:00Z'))).toBe('05/12/2026 21:00');
    expect(formatDateTimeBR('2026-01-01T03:05:00Z')).toBe('01/01/2026 00:05');
  });

  it('toIsoWithOffset gera ISO 8601 com -03:00', () => {
    expect(toIsoWithOffset(new Date('2026-12-06T00:00:00Z'))).toBe('2026-12-05T21:00:00-03:00');
    expect(toIsoWithOffset('2026-07-15T12:34:56Z')).toBe('2026-07-15T09:34:56-03:00');
  });

  it('withTransaction confirma no sucesso e desfaz no erro', async () => {
    const db = testDb();
    const insert = (client: Queryable, id: string, email: string) =>
      client.query(
        "INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, 'Teste', $2, 'h', 'participante')",
        [id, email],
      );
    const ok = newId('usr');
    const result = await withTransaction(db, async (client) => {
      await insert(client, ok, 'ok@catraca.test');
      return 'feito';
    });
    expect(result).toBe('feito');

    const desfeito = newId('usr');
    await expect(
      withTransaction(
        db,
        async (client) => {
          await insert(client, desfeito, 'desfeito@catraca.test');
          throw new Error('falha proposital');
        },
        { isolation: 'serializable' },
      ),
    ).rejects.toThrow('falha proposital');

    const { rows } = await db.query<{ id: string }>('SELECT id FROM users ORDER BY email');
    expect(rows.map((row) => row.id)).toEqual([ok]);
  });

  it('conexões do pool usam o fuso America/Sao_Paulo e int8 chega como number', async () => {
    const { rows } = await testDb().query<{ tz: string; total: unknown }>(
      "SELECT current_setting('TimeZone') AS tz, count(*) AS total FROM users",
    );
    expect(rows[0]?.tz).toBe('America/Sao_Paulo');
    expect(rows[0]?.total).toBe(0);
  });
});
