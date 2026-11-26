// Módulo gateway (F03): decora app.gateway com o gateway de pagamento simulado e, no processo da
// aplicação (backgroundJobs), roda o worker que entrega os resultados.
import fp from 'fastify-plugin';
import { criarGatewaySimulado } from './gateway.js';
import './types.js';

/** Depois do módulo contas (10) e antes dos módulos com o padrão 100 (a compra, F05, entre eles). */
export const loadOrder = 20;

export default fp(
  async (app) => {
    const gateway = criarGatewaySimulado({ db: app.db, config: app.config, log: app.log });
    app.decorate('gateway', gateway);

    // Primeira varredura imediata, antes do listen: entrega o que venceu com a aplicação parada.
    app.addHook('onReady', async () => {
      if (app.backgroundJobs) gateway.iniciarWorker();
    });

    // Espera a entrega em andamento antes de o pool ser encerrado (main.ts fecha o app e depois o pool).
    app.addHook('onClose', async () => {
      await gateway.pararWorker();
    });
  },
  { name: 'gateway' },
);
