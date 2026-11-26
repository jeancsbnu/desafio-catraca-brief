// Serviço de compra (spec 5.2, 5.3): o único caminho que cria ingressos, igual para vitrine e API.
//
// Garantia de R07: a transação (READ COMMITTED) trava a linha do evento com lockEventForUpdate
// (SELECT … FOR UPDATE, o mesmo protocolo da edição e do cancelamento da F04) e só depois conta
// pending + confirmed, insere o ingresso e registra a tentativa de pagamento. Duas compras do mesmo
// evento nunca estão ao mesmo tempo entre a trava e o COMMIT; a contagem da segunda é uma instrução
// nova, que já enxerga o ingresso confirmado pela primeira. Compras de eventos diferentes travam
// linhas diferentes e não se esperam. O serviço responde sem esperar o gateway (R06).
import { newId } from '../../core/ids.js';
import { withTransaction } from '../../db/transaction.js';
import { isEventId, isOnSale, lockEventForUpdate } from '../eventos/public.js';
import { generateTicketCode } from './code.js';
import { findPurchaseAccount, insertTicket } from './repository.js';
import { countOccupiedSeats } from './seats.js';
import type {
  PurchaseRejectionReason,
  PurchaseResult,
  TicketChannel,
  TicketRecord,
  TicketService,
  TicketServiceDeps,
} from './types.js';
import { isValidBuyerEmail, isValidCardNumber, normalizeBuyerEmail } from './validation.js';

/** A compra desiste (erro 55P03) se não obtiver a trava do evento nesse tempo. */
export const PURCHASE_LOCK_TIMEOUT = '5s';
/** Tentativas de código antes de desistir da compra (colisão é praticamente impossível). */
export const MAX_CODE_ATTEMPTS = 5;

const USER_ID = /^usr_[a-z0-9]{16}$/;

type RejectionField = 'cardNumber' | 'buyer' | 'channel';

type Buyer = { ok: true; userId: string | null; email: string } | { ok: false; field: RejectionField };

type Locked = { ok: true; ticket: TicketRecord } | { ok: false; reason: Exclude<PurchaseRejectionReason, 'invalid_request'> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Texto curto para o log (o serviço é defensivo: a F07 recebe JSON qualquer). */
function loggable(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, 64) : null;
}

export function createTicketService(deps: TicketServiceDeps): TicketService {
  const { db, gateway, log } = deps;
  const generateCode = deps.generateCode ?? (() => generateTicketCode());

  function refuse(
    eventId: unknown,
    channel: unknown,
    reason: PurchaseRejectionReason,
    field?: RejectionField,
  ): PurchaseResult {
    log.info(
      { eventId: loggable(eventId), reason, channel: loggable(channel), ...(field === undefined ? {} : { field }) },
      'ingressos: compra recusada',
    );
    return field === undefined ? { ok: false, reason } : { ok: false, reason, field };
  }

  /** Canal e comprador (só a leitura da conta, fora de transação). */
  async function resolveBuyer(channel: TicketChannel, buyer: unknown): Promise<Buyer> {
    if (!isRecord(buyer) || (buyer.type !== 'account' && buyer.type !== 'email')) return { ok: false, field: 'buyer' };
    if ((channel === 'vitrine') !== (buyer.type === 'account')) return { ok: false, field: 'channel' };
    if (buyer.type === 'email') {
      const email = buyer.email;
      if (typeof email !== 'string' || !isValidBuyerEmail(email)) return { ok: false, field: 'buyer' };
      return { ok: true, userId: null, email: normalizeBuyerEmail(email) };
    }
    const userId = buyer.userId;
    if (typeof userId !== 'string' || !USER_ID.test(userId)) return { ok: false, field: 'buyer' };
    const account = await findPurchaseAccount(db, userId);
    if (account === null || account.role !== 'participante') return { ok: false, field: 'buyer' };
    return { ok: true, userId: account.id, email: normalizeBuyerEmail(account.email) };
  }

  async function purchase(input: unknown): Promise<PurchaseResult> {
    const raw = isRecord(input) ? input : {};
    const { eventId, cardNumber, channel } = raw;

    // 1. Cartão: nada é lido nem gravado.
    if (!isValidCardNumber(cardNumber)) return refuse(eventId, channel, 'invalid_request', 'cardNumber');
    // 2. Canal e comprador.
    if (channel !== 'vitrine' && channel !== 'api') return refuse(eventId, channel, 'invalid_request', 'channel');
    const buyer = await resolveBuyer(channel, raw.buyer);
    if (!buyer.ok) return refuse(eventId, channel, 'invalid_request', buyer.field);
    // 3. Formato do id do evento, sem abrir transação.
    if (!isEventId(eventId)) return refuse(eventId, channel, 'event_not_available');

    // 4. Transação: trava do evento → à venda → vagas → ingresso + tentativa de pagamento.
    const result = await withTransaction(
      db,
      async (client): Promise<Locked> => {
        await client.query(`SET LOCAL lock_timeout = '${PURCHASE_LOCK_TIMEOUT}'`);
        const event = await lockEventForUpdate(client, eventId);
        if (event === null || !isOnSale(event)) return { ok: false, reason: 'event_not_available' };
        const occupied = await countOccupiedSeats(client, event.id);
        if (occupied >= event.capacity) return { ok: false, reason: 'sold_out' };

        let ticket: TicketRecord | null = null;
        for (let attempt = 1; ticket === null; attempt += 1) {
          if (attempt > MAX_CODE_ATTEMPTS) throw new Error('ingressos: não foi possível gerar um código único');
          if (attempt > 1) log.warn({ eventId: event.id, tentativa: attempt }, 'ingressos: código repetido, gerando outro');
          ticket = await insertTicket(client, {
            id: newId('tkt'),
            eventId: event.id,
            code: generateCode(),
            pricePaidCents: event.priceCents,
            channel,
            buyerUserId: buyer.userId,
            buyerEmail: buyer.email,
          });
        }
        // A tentativa nasce e morre com esta transação: erro aqui desfaz o ingresso também.
        await gateway.solicitarAutorizacao({ referencia: ticket.id, numeroCartao: cardNumber }, { transacao: client });
        return { ok: true, ticket };
      },
      { isolation: 'read committed' },
    );

    if (!result.ok) return refuse(eventId, channel, result.reason);
    log.info({ ticketId: result.ticket.id, eventId: result.ticket.eventId, channel }, 'ingressos: compra registrada');
    return result;
  }

  return { purchase: (input) => purchase(input) };
}
