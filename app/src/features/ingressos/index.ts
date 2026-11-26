// Módulo ingressos (F05): tabela tickets, serviço de compra (app.tickets, usado por F06 e F07) e o
// ciclo do ingresso. Sem rotas. Envolvido por fastify-plugin: app.tickets vale para os outros módulos.
import './types.js';
import fp from 'fastify-plugin';
import { handleEventCancelled, handlePaymentResult } from './lifecycle.js';
import { countOccupiedSeats } from './seats.js';
import { createTicketService } from './service.js';

/** Depois de contas (10), gateway (20) e eventos (30); antes dos módulos com o padrão (100). */
export const loadOrder = 40;

export default fp(
  async (app) => {
    app.decorate('tickets', createTicketService({ db: app.db, gateway: app.gateway, log: app.log }));

    // Registros nos pontos de extensão de F04 e F03, no registro do plugin (antes do onReady).
    // Lotação mínima da edição com as vagas reais (R03, R05), contadas sob a trava da F04.
    app.events.setOccupiedSeatsProvider(countOccupiedSeats);
    // Efeitos do cancelamento nos ingressos, na transação do cancelamento (R11).
    app.events.onEventCancelled(handleEventCancelled(app.log));
    // Resultado assíncrono do pagamento (R08), na transação de entrega do worker.
    app.gateway.aoReceberResultado(handlePaymentResult(app.log));
  },
  { name: 'ingressos', dependencies: ['eventos', 'gateway'] },
);
