// Módulo gateway (F03): decora app.gateway com o gateway de pagamento simulado.
import fp from 'fastify-plugin';
import { criarGatewaySimulado } from './gateway.js';
import './types.js';

/** Depois do módulo contas (10) e antes dos módulos com o padrão 100 (a compra, F05, entre eles). */
export const loadOrder = 20;

export default fp(
  async (app) => {
    const gateway = criarGatewaySimulado({ db: app.db, config: app.config });
    app.decorate('gateway', gateway);
  },
  { name: 'gateway' },
);
