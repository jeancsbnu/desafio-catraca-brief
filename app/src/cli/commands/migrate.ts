import { BOOT_PREFIX } from '../../core/boot-log.js';
import { describeMigrationReport, runMigrations } from '../../db/migrate.js';
import type { CliContext } from '../index.js';

export const name = 'migrate';
export const description = 'Aplica as migrations pendentes e mostra o relatório';

export async function run(context: CliContext): Promise<number> {
  const report = await runMigrations(context.db);
  for (const line of describeMigrationReport(report)) context.print(`${BOOT_PREFIX} ${line}`);
  return 0;
}
