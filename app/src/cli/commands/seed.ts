import { BOOT_PREFIX } from '../../core/boot-log.js';
import { describeSeedReport, runSeed } from '../../db/seed.js';
import type { CliContext } from '../index.js';

export const name = 'seed';
export const description = 'Garante as 3 contas da seed (sem duplicar) e mostra o relatório';

export async function run(context: CliContext): Promise<number> {
  const report = await runSeed(context.db);
  context.print(`${BOOT_PREFIX} ${describeSeedReport(report)}`);
  return 0;
}
