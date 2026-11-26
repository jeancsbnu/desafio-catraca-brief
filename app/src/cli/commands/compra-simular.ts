// catraca compra:simular --evento <id> --cartao <número> [--email <e-mail> | --conta <e-mail>] [--paralelas <N>]
// Dispara 1 ou N compras simultâneas pelo mesmo serviço de compra da vitrine e da API (F05), cada uma
// numa conexão própria de um pool pré-aquecido, e imprime o resultado de cada compra, o resumo e as
// vagas do evento. A CLI não roda worker: os resultados do gateway são entregues pela aplicação no ar.
// O número do cartão é repassado sem validação (invalid_request fica observável) e nunca é impresso.
import { errorMessage } from '../../core/boot-log.js';
import { createPool } from '../../db/pool.js';
import { criarGatewaySimulado } from '../../features/gateway/public.js';
import {
  createTicketService,
  getSeatAvailability,
  type PurchaseInput,
  type PurchaseResult,
  type TicketLogger,
} from '../../features/ingressos/public.js';
import type { CliContext } from '../index.js';

export const name = 'compra:simular';
export const description = 'Cria uma ou N compras simultâneas num evento e mostra o resultado de cada uma';

const USO =
  'Uso: catraca compra:simular --evento <id> --cartao <número> [--email <e-mail> | --conta <e-mail de participante>] [--paralelas <1 a 50>]';
const OPTIONS = ['--evento', '--cartao', '--email', '--conta', '--paralelas'] as const;
type Option = (typeof OPTIONS)[number];
const MAX_PARALLEL = 50;

const nothing = (): void => {};
const silent: TicketLogger & { debug: () => void } = { debug: nothing, info: nothing, warn: nothing, error: nothing };

interface Options {
  eventId: string;
  cardNumber: string;
  email: string | undefined;
  account: string | undefined;
  parallel: number;
}

/** Opções em qualquer ordem, cada uma uma vez, sempre com o valor separado por espaço; null = uso inválido. */
function parseOptions(args: readonly string[]): Options | null {
  const values = new Map<Option, string>();
  for (let i = 0; i < args.length; i += 2) {
    const option = args[i] as Option;
    const value = args[i + 1];
    if (!OPTIONS.includes(option) || values.has(option)) return null;
    if (value === undefined || value.startsWith('--')) return null;
    values.set(option, value);
  }
  const eventId = values.get('--evento');
  const cardNumber = values.get('--cartao');
  if (eventId === undefined || cardNumber === undefined) return null;
  const email = values.get('--email');
  const account = values.get('--conta');
  if (email !== undefined && account !== undefined) return null;
  const parallelText = values.get('--paralelas') ?? '1';
  if (!/^[0-9]{1,3}$/.test(parallelText)) return null;
  const parallel = Number(parallelText);
  if (parallel < 1 || parallel > MAX_PARALLEL) return null;
  return { eventId, cardNumber, email, account, parallel };
}

/** Segundos com duas casas e vírgula (0,04). */
function seconds(ms: number): string {
  return (ms / 1000).toFixed(2).replace('.', ',');
}

type Outcome = { result: PurchaseResult; ms: number } | { error: unknown; ms: number };

export async function run({ args, config, print, printError }: CliContext): Promise<number> {
  const options = parseOptions(args);
  if (options === null) {
    printError(USO);
    return 2;
  }
  const n = options.parallel;

  // Pool próprio: uma conexão por compra + uma para as consultas.
  const pool = createPool({ databaseUrl: config.databaseUrl, max: n + 1 });
  try {
    let buyer = (i: number): Pick<PurchaseInput, 'buyer' | 'channel'> => ({
      buyer: { type: 'email', email: options.email ?? `simulacao-${i}@example.com` },
      channel: 'api',
    });
    if (options.account !== undefined) {
      const { rows } = await pool.query<{ id: string }>(
        "SELECT id, email FROM users WHERE lower(email) = lower($1) AND role = 'participante'",
        [options.account],
      );
      const userId = rows[0]?.id;
      if (userId === undefined) {
        printError(`Conta de participante não encontrada: ${options.account}`);
        return 2;
      }
      buyer = () => ({ buyer: { type: 'account', userId }, channel: 'vitrine' });
    }

    // Pré-aquecimento: as N conexões abertas antes do disparo, para as compras saírem juntas.
    const clients = await Promise.all(Array.from({ length: n }, () => pool.connect()));
    for (const client of clients) client.release();

    const gateway = criarGatewaySimulado({ db: pool, config, log: silent });
    const service = createTicketService({ db: pool, gateway, log: silent });
    const inputs: PurchaseInput[] = Array.from({ length: n }, (_, index) => ({
      eventId: options.eventId,
      cardNumber: options.cardNumber,
      ...buyer(index + 1),
    }));

    print(`simulando ${n} compra(s) simultânea(s) no evento ${options.eventId} pelo canal ${inputs[0]?.channel ?? 'api'}`);
    // Disparo simultâneo: todas as chamadas começam antes de qualquer await.
    const outcomes = await Promise.all(
      inputs.map(async (input): Promise<Outcome> => {
        const start = performance.now();
        try {
          const result = await service.purchase(input);
          return { result, ms: performance.now() - start };
        } catch (error) {
          return { error, ms: performance.now() - start };
        }
      }),
    );

    const counts = { criadas: 0, sold_out: 0, event_not_available: 0, invalid_request: 0, erros: 0 };
    outcomes.forEach((outcome, index) => {
      const prefix = `compra ${index + 1}/${n}:`;
      if ('error' in outcome) {
        counts.erros += 1;
        print(`${prefix} erro ${errorMessage(outcome.error)} em ${seconds(outcome.ms)} s`);
      } else if (outcome.result.ok) {
        const { ticket } = outcome.result;
        counts.criadas += 1;
        print(
          `${prefix} criada ${ticket.id} código ${ticket.code} status ${ticket.status} valor ${ticket.pricePaidCents} ` +
            `em ${seconds(outcome.ms)} s`,
        );
      } else {
        counts[outcome.result.reason] += 1;
        print(`${prefix} recusada ${outcome.result.reason} em ${seconds(outcome.ms)} s`);
      }
    });
    print(
      `resumo: criadas ${counts.criadas}, sold_out ${counts.sold_out}, event_not_available ${counts.event_not_available}, ` +
        `invalid_request ${counts.invalid_request}, erros ${counts.erros}`,
    );

    const seats = await getSeatAvailability(pool, options.eventId);
    print(
      seats === null
        ? 'vagas: evento não encontrado'
        : `vagas: lotação ${seats.capacity}, ocupadas ${seats.occupied}, disponíveis ${seats.available} (evento ${seats.eventStatus})`,
    );
    return counts.erros > 0 ? 1 : 0;
  } finally {
    await pool.end();
  }
}
