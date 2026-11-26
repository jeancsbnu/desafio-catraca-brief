// catraca gateway:simular <cartão> [--sem-esperar] — solicita um pagamento de diagnóstico ao
// gateway simulado e espera o worker do processo da aplicação entregar o resultado.
// A CLI não roda worker; o número completo do cartão nunca é impresso.
import { errorMessage } from '../../core/boot-log.js';
import { criarGatewaySimulado } from '../../features/gateway/public.js';
import { buscarTentativa } from '../../features/gateway/repositorio.js';
import type { CliContext } from '../index.js';

export const name = 'gateway:simular';
export const description = 'Simula um pagamento no gateway e mostra o resultado e o tempo';

const USO = 'Uso: catraca gateway:simular <número do cartão com 16 dígitos> [--sem-esperar]';
const CARTAO_INVALIDO = 'Número de cartão inválido: informe exatamente 16 dígitos (ex.: 4000000000000001).';
const OPCAO_SEM_ESPERAR = '--sem-esperar';
const CONSULTA_MS = 100;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Segundos com uma casa decimal e vírgula (ex.: 3,4). */
function segundos(valor: number): string {
  return valor.toFixed(1).replace('.', ',');
}

export async function run({ args, config, db, print, printError }: CliContext): Promise<number> {
  let semEsperar = false;
  const posicionais: string[] = [];
  for (const arg of args) {
    if (arg === OPCAO_SEM_ESPERAR && !semEsperar) {
      semEsperar = true;
    } else if (arg.startsWith('-')) {
      printError(USO);
      return 2;
    } else {
      posicionais.push(arg);
    }
  }
  const [numero] = posicionais;
  if (numero === undefined || posicionais.length !== 1) {
    printError(USO);
    return 2;
  }
  if (!/^[0-9]{16}$/.test(numero)) {
    printError(CARTAO_INVALIDO);
    return 2;
  }

  try {
    const gateway = criarGatewaySimulado({ db, config });
    const inicio = performance.now();
    const solicitacao = await gateway.solicitarDiagnostico(numero);
    const duracao = (performance.now() - inicio) / 1000;
    print(
      `solicitação ${solicitacao.tentativaId} registrada em ${segundos(duracao)} s ` +
        `(cartão final ${solicitacao.finalCartao}, modo ${gateway.modo}, escala ${String(gateway.escala)})`,
    );
    if (semEsperar) return 0;

    // Quem entrega é o worker do processo da aplicação; aqui só se consulta a tentativa.
    const limiteMs = Math.max(60_000 * gateway.escala, 2_000);
    for (;;) {
      const linha = await buscarTentativa(db, solicitacao.tentativaId);
      if (linha !== null && linha.delivered_at !== null && linha.segundos_ate_entrega !== null) {
        // delivered_at − requested_at, ambos do relógio do banco (arredondado no SQL).
        print(`${linha.result} em ${linha.segundos_ate_entrega.replace('.', ',')} s`);
        return 0;
      }
      const decorridoMs = performance.now() - inicio;
      if (decorridoMs >= limiteMs) {
        printError(
          `sem resultado em ${segundos(decorridoMs / 1000)} s: a tentativa ${solicitacao.tentativaId} continua pendente ` +
            '(o worker roda no processo da aplicação; ela está no ar?)',
        );
        return 1;
      }
      await sleep(Math.min(CONSULTA_MS, limiteMs - decorridoMs));
    }
  } catch (error) {
    printError(`Erro: ${errorMessage(error)}`);
    return 1;
  }
}
