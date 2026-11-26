// Runner de migrations: arquivos SQL em app/migrations/ (AAAAMMDDHHMMSS_nome.sql), aplicados em
// ordem de nome, uma transação por arquivo, com tabela de controle, checksum e trava consultiva.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorMessage } from '../core/boot-log.js';
import type { Db } from './pool.js';

/** Pasta padrão: app/migrations (vale para src/db e dist/db). */
export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

/** Chave fixa da trava consultiva (pg_advisory_lock) das migrations. */
export const MIGRATION_LOCK_KEY = 72_026_112_501;

const FILE_PATTERN = /^\d{14}_[a-z0-9_]+\.sql$/;

export interface MigrationReport {
  /** Ids (nome sem .sql) aplicados nesta execução, em ordem. */
  applied: string[];
  /** Quantos arquivos da pasta já estavam aplicados. */
  alreadyApplied: number;
}

export interface MigrationOptions {
  dir?: string;
}

/** Linhas do relatório (sem o prefixo [catraca]), usadas na subida e em `catraca migrate`. */
export function describeMigrationReport(report: MigrationReport): string[] {
  return [
    ...report.applied.map((id) => `migration aplicada: ${id}`),
    `migrations: aplicadas ${report.applied.length}, já aplicadas ${report.alreadyApplied}`,
  ];
}

function checksumOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function listMigrationFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql')).map((entry) => entry.name);
  for (const file of files) {
    if (!FILE_PATTERN.test(file)) {
      throw new Error(`Nome de migration inválido: ${file} (use AAAAMMDDHHMMSS_nome.sql)`);
    }
  }
  return files.sort();
}

export async function runMigrations(db: Db, options: MigrationOptions = {}): Promise<MigrationReport> {
  const dir = options.dir ?? DEFAULT_MIGRATIONS_DIR;
  const files = await listMigrationFiles(dir);

  const client = await db.connect();
  let locked = false;
  let broken: Error | undefined;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    locked = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         text        PRIMARY KEY,
        checksum   text        NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ id: string; checksum: string }>(
      'SELECT id, checksum FROM schema_migrations',
    );
    const appliedChecksums = new Map(rows.map((row) => [row.id, row.checksum]));

    const pending: { id: string; file: string; content: string; checksum: string }[] = [];
    let alreadyApplied = 0;
    for (const file of files) {
      const id = file.slice(0, -'.sql'.length);
      const content = await readFile(join(dir, file), 'utf8');
      const checksum = checksumOf(content);
      const known = appliedChecksums.get(id);
      if (known === undefined) {
        pending.push({ id, file, content, checksum });
      } else if (known !== checksum) {
        throw new Error(
          `Migration já aplicada foi alterada: ${file}. Crie uma migration nova ` +
            '(em desenvolvimento, recrie o volume com docker compose down -v).',
        );
      } else {
        alreadyApplied += 1;
      }
    }

    const applied: string[] = [];
    for (const migration of pending) {
      try {
        await client.query('BEGIN');
        await client.query(migration.content);
        await client.query('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [
          migration.id,
          migration.checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          broken = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
        }
        throw new Error(`${migration.file}: ${errorMessage(error)}`, { cause: error });
      }
      applied.push(migration.id);
    }

    return { applied, alreadyApplied };
  } finally {
    if (locked && broken === undefined) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
      } catch (unlockError) {
        broken = unlockError instanceof Error ? unlockError : new Error(String(unlockError));
      }
    }
    // Cliente com erro é descartado (a trava de sessão cai junto com a conexão).
    client.release(broken);
  }
}
