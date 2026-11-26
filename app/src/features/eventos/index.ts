// Módulo eventos (F04): tabela events, área do organizador (lista, criação e página de gestão com
// edição, publicação e cancelamento), isolamento por dono e os pontos de extensão app.events.
// Envolvido por fastify-plugin: app.events e request.ownedEvent valem para os outros módulos.
import './types.js';
import fp from 'fastify-plugin';
import { createEventsExtensions } from './extensions.js';
import { registerEventRoutes } from './routes.js';

/** Depois de contas (10) e gateway (20); antes das consumidoras (F05 em diante, > 30). */
export const loadOrder = 30;

export default fp(
  async (app) => {
    const extensions = createEventsExtensions(app);
    app.decorate('events', extensions.publicApi());
    app.decorateRequest('ownedEvent', null);

    // Registros de extensão só no registro dos plugins (ou num teste antes do primeiro inject).
    app.addHook('onReady', async () => {
      extensions.freeze();
    });

    // Assume o GET /organizador do módulo mínimo da F02 (removido) e as rotas de eventos.
    registerEventRoutes(app, extensions);
  },
  { name: 'eventos', dependencies: ['contas'] },
);
