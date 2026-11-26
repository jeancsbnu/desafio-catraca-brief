import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/db/migrate.js';
import type { Db } from '../../src/db/pool.js';
import { withTemporaryDatabase } from '../helpers/db.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'catraca-migrations-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(file: string, sql: string): Promise<void> {
  await writeFile(join(dir, file), sql, 'utf8');
}

async function tableExists(db: Db, name: string): Promise<boolean> {
  const { rows } = await db.query<{ exists: boolean }>('SELECT to_regclass($1) IS NOT NULL AS exists', [
    `public.${name}`,
  ]);
  return rows[0]?.exists ?? false;
}

async function registered(db: Db): Promise<{ id: string; checksum: string }[]> {
  const { rows } = await db.query<{ id: string; checksum: string }>(
    'SELECT id, checksum FROM schema_migrations ORDER BY id',
  );
  return rows;
}

describe('F01 runner de migrations', () => {
  it('F01-CA03 aplica as migrations pendentes em ordem e registra cada uma', async () => {
    await write('20260101000002_segunda.sql', 'ALTER TABLE a ADD COLUMN nome text;');
    await write('20260101000001_primeira.sql', 'CREATE TABLE a (id int PRIMARY KEY);');
    await withTemporaryDatabase(async (db) => {
      const report = await runMigrations(db, { dir });
      expect(report).toEqual({
        applied: ['20260101000001_primeira', '20260101000002_segunda'],
        alreadyApplied: 0,
      });
      const rows = await registered(db);
      expect(rows.map((row) => row.id)).toEqual(['20260101000001_primeira', '20260101000002_segunda']);
      for (const row of rows) expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
      const { rows: columns } = await db.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'a' ORDER BY ordinal_position",
      );
      expect(columns.map((c) => c.column_name)).toEqual(['id', 'nome']);
    });
  });

  it('F01-CA03 segunda execução não aplica nada', async () => {
    await write('20260101000001_primeira.sql', 'CREATE TABLE a (id int PRIMARY KEY);');
    await write('20260101000002_segunda.sql', 'CREATE TABLE b (id int PRIMARY KEY);');
    await withTemporaryDatabase(async (db) => {
      await runMigrations(db, { dir });
      const second = await runMigrations(db, { dir });
      expect(second).toEqual({ applied: [], alreadyApplied: 2 });
      expect(await registered(db)).toHaveLength(2);
    });
  });

  it('aplica migration pendente com timestamp anterior à última aplicada', async () => {
    await write('20260101000005_recente.sql', 'CREATE TABLE recente (id int);');
    await withTemporaryDatabase(async (db) => {
      await runMigrations(db, { dir });
      // Migration de uma branch paralela, com timestamp mais antigo, chega depois.
      await write('20260101000003_antiga.sql', 'CREATE TABLE antiga (id int);');
      const report = await runMigrations(db, { dir });
      expect(report).toEqual({ applied: ['20260101000003_antiga'], alreadyApplied: 1 });
      expect(await tableExists(db, 'antiga')).toBe(true);
    });
  });

  it('migration com erro é desfeita por inteiro e não é registrada', async () => {
    await write('20260101000001_ok.sql', 'CREATE TABLE ok (id int);');
    await write('20260101000002_falha.sql', 'CREATE TABLE parcial (id int);\nSELECT 1/0;\n');
    await withTemporaryDatabase(async (db) => {
      await expect(runMigrations(db, { dir })).rejects.toThrow('20260101000002_falha.sql: division by zero');
      expect(await tableExists(db, 'ok')).toBe(true);
      expect(await tableExists(db, 'parcial')).toBe(false);
      expect((await registered(db)).map((row) => row.id)).toEqual(['20260101000001_ok']);
      // A trava foi liberada: uma nova execução não fica presa.
      await rm(join(dir, '20260101000002_falha.sql'));
      expect(await runMigrations(db, { dir })).toEqual({ applied: [], alreadyApplied: 1 });
    });
  });

  it('rejeita nome de arquivo fora do padrão', async () => {
    await write('20260101000001_ok.sql', 'CREATE TABLE ok (id int);');
    await write('2026_sem_timestamp.sql', 'CREATE TABLE x (id int);');
    await withTemporaryDatabase(async (db) => {
      await expect(runMigrations(db, { dir })).rejects.toThrow(
        'Nome de migration inválido: 2026_sem_timestamp.sql (use AAAAMMDDHHMMSS_nome.sql)',
      );
      expect(await tableExists(db, 'ok')).toBe(false);
    });
  });

  it('rejeita migration já aplicada cujo conteúdo mudou', async () => {
    await write('20260101000001_ok.sql', 'CREATE TABLE ok (id int);');
    await withTemporaryDatabase(async (db) => {
      await runMigrations(db, { dir });
      await write('20260101000001_ok.sql', 'CREATE TABLE ok (id int, nome text);');
      await expect(runMigrations(db, { dir })).rejects.toThrow(
        'Migration já aplicada foi alterada: 20260101000001_ok.sql',
      );
    });
  });

  it('duas execuções simultâneas aplicam cada migration uma única vez', async () => {
    await write('20260101000001_a.sql', 'CREATE TABLE a (id int);');
    await write('20260101000002_b.sql', 'CREATE TABLE b (id int);');
    await write('20260101000003_c.sql', 'CREATE TABLE c (id int);');
    await withTemporaryDatabase(async (db) => {
      const [first, second] = await Promise.all([runMigrations(db, { dir }), runMigrations(db, { dir })]);
      const applied = [...first.applied, ...second.applied].sort();
      expect(applied).toEqual(['20260101000001_a', '20260101000002_b', '20260101000003_c']);
      expect(first.alreadyApplied + second.alreadyApplied).toBe(3);
      expect(await registered(db)).toHaveLength(3);
    });
  });

  it('as migrations do projeto criam users com índice único em lower(email)', async () => {
    await withTemporaryDatabase(async (db) => {
      const report = await runMigrations(db);
      expect(report.applied).toContain('20261125120000_create_users');

      const { rows: columns } = await db.query<{ column_name: string; data_type: string; is_nullable: string }>(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' ORDER BY ordinal_position`,
      );
      expect(columns).toEqual([
        { column_name: 'id', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'name', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'email', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'password_hash', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'role', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      ]);

      const { rows: constraints } = await db.query<{ conname: string }>(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'public.users'::regclass ORDER BY conname",
      );
      expect(constraints.map((c) => c.conname)).toEqual([
        'users_email_length',
        'users_id_format',
        'users_name_length',
        'users_pkey',
        'users_role_check',
      ]);

      const { rows: indexes } = await db.query<{ indexdef: string }>(
        "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_email_lower_key'",
      );
      expect(indexes[0]?.indexdef).toMatch(/CREATE UNIQUE INDEX users_email_lower_key ON public\.users USING btree \(lower\(email\)\)/);
    });
  });
});
