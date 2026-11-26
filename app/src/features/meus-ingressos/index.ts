// Módulo meus-ingressos (F06; assume a página mínima da F02): GET /meus-ingressos com os ingressos
// comprados pela vitrine com a conta logada, do mais recente para o mais antigo. Mantém o guarda
// requireParticipant() (visitante → /entrar; organizador → 403) e o <h1>Meus ingressos</h1>.
import type { FastifyRequest } from 'fastify';
import type { PageMessage } from '../../core/layout.js';
import type { FeaturePlugin } from '../../core/modules.js';
import { currentUser, requireParticipant } from '../contas/public.js';
import { findEventsByIds } from '../eventos/public.js';
import { listTicketsByBuyer } from '../ingressos/public.js';
import { MY_TICKETS_PATH, MY_TICKETS_TITLE, PURCHASE_OK_CODE, PURCHASE_REGISTERED_MESSAGE } from './messages.js';
import { myTicketsContent, type MyTicketRow } from './pages.js';

/** "Compra registrada" só com ?ok=compra exato (outro valor, repetido ou não-texto é ignorado). */
function successMessages(request: FastifyRequest): PageMessage[] {
  const query = request.query;
  const ok = typeof query === 'object' && query !== null ? (query as Record<string, unknown>).ok : undefined;
  return ok === PURCHASE_OK_CODE ? [{ kind: 'success', text: PURCHASE_REGISTERED_MESSAGE }] : [];
}

const meusIngressos: FeaturePlugin = async (app) => {
  app.get(MY_TICKETS_PATH, { preHandler: requireParticipant() }, async (request, reply) => {
    // Só os ingressos com a conta da sessão (compras pela API ficam sem conta, mesmo com o e-mail dela).
    const tickets = await listTicketsByBuyer(app.db, currentUser(request).id);
    const events = await findEventsByIds(
      app.db,
      tickets.map((ticket) => ticket.eventId),
    );
    const rows: MyTicketRow[] = tickets.map((ticket) => {
      const event = events.get(ticket.eventId);
      if (event === undefined) throw new Error(`meus-ingressos: evento ${ticket.eventId} do ingresso ${ticket.id} não encontrado`);
      return { ticket, event };
    });
    return reply.page({ title: MY_TICKETS_TITLE, messages: successMessages(request), content: myTicketsContent(rows) });
  });
};

export default meusIngressos;
