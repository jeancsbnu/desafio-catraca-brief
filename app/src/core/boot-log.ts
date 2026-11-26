// Mensagens de texto da inicialização e da linha de comando, com o prefixo [catraca].
// São independentes do logger JSON do Fastify (que cuida dos logs de requisição).

export const BOOT_PREFIX = '[catraca]';

export function bootLog(message: string): void {
  process.stdout.write(`${BOOT_PREFIX} ${message}\n`);
}

export function bootError(message: string): void {
  process.stderr.write(`${BOOT_PREFIX} ${message}\n`);
}

/** Mensagem legível de um erro qualquer (sem stack). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message !== '') return error.message;
    // AggregateError (ex.: conexão recusada em IPv4 e IPv6) pode vir sem mensagem própria.
    if (error instanceof AggregateError && error.errors.length > 0) {
      return errorMessage(error.errors[0]);
    }
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : error.name;
  }
  return String(error);
}
