// Laço de varredura do gateway: uma varredura por vez, encadeada por setTimeout (sem sobreposição).
import type { LoggerGateway } from './types.js';

/** Intervalo entre o fim de uma varredura e o início da próxima. */
export const INTERVALO_VARREDURA_MS = 200;
/** Espera mínima depois de uma varredura que falhou (ex.: banco indisponível). */
export const ESPERA_APOS_FALHA_MS = 1000;

export interface OpcoesLaco {
  processar: () => Promise<unknown>;
  intervaloMs: number;
  log: LoggerGateway;
}

export interface LacoDeVarredura {
  readonly ativo: boolean;
  /** Agenda a primeira varredura imediatamente. Idempotente. */
  iniciar(): void;
  /** Impede novos agendamentos e espera a varredura em andamento terminar. Idempotente. */
  parar(): Promise<void>;
}

export function criarLacoDeVarredura({ processar, intervaloMs, log }: OpcoesLaco): LacoDeVarredura {
  let ativo = false;
  let timer: NodeJS.Timeout | undefined;
  let emAndamento: Promise<void> | undefined;

  function agendar(esperaMs: number): void {
    if (!ativo) return;
    timer = setTimeout(executar, esperaMs);
    timer.unref();
  }

  function executar(): void {
    timer = undefined;
    if (!ativo || emAndamento !== undefined) return;
    emAndamento = (async () => {
      let espera = intervaloMs;
      try {
        await processar();
      } catch (error) {
        log.warn({ err: error }, 'gateway: falha na varredura');
        espera = Math.max(intervaloMs, ESPERA_APOS_FALHA_MS);
      }
      emAndamento = undefined;
      agendar(espera);
    })();
  }

  return {
    get ativo() {
      return ativo;
    },

    iniciar() {
      if (ativo) return;
      ativo = true;
      executar();
    },

    async parar() {
      ativo = false;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      await emAndamento;
    },
  };
}
