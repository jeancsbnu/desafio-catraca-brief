import { describeConfig } from '../../config.js';
import type { CliContext } from '../index.js';

export const name = 'config';
export const description = 'Mostra a configuração efetiva (segredos mascarados)';

export async function run(context: CliContext): Promise<number> {
  for (const line of describeConfig(context.config, context.env)) context.print(line);
  return 0;
}
