// Módulo ingressos (F05): tabela tickets, serviço de compra (app.tickets, usado por F06 e F07) e o
// ciclo do ingresso. Sem rotas. Envolvido por fastify-plugin: app.tickets vale para os outros módulos.
import './types.js';
import fp from 'fastify-plugin';
import { createTicketService } from './service.js';

/** Depois de contas (10), gateway (20) e eventos (30); antes dos módulos com o padrão (100). */
export const loadOrder = 40;

export default fp(
  async (app) => {
    app.decorate('tickets', createTicketService({ db: app.db, gateway: app.gateway, log: app.log }));
  },
  { name: 'ingressos', dependencies: ['eventos', 'gateway'] },
);
