// Módulo contas: identidade (sessão por cookie assinado guardada no banco), cadastro, login, saída,
// navegação de conta e proteções. Envolvido por fastify-plugin: hooks e decorator valem para todas
// as rotas de todos os módulos (e para o 404 da raiz). Carrega antes dos demais (loadOrder 10).
import './types.js';
import fp from 'fastify-plugin';
import type { FeaturePlugin } from '../../core/modules.js';
import { hashPassword } from '../../core/password.js';
import { newSessionToken } from './cookie.js';
import { loadSession, noStoreWhenLoggedIn, organizerArea, originCheck } from './guards.js';
import { navContribution } from './pages.js';
import { registerAccountRoutes } from './routes.js';

export const loadOrder = 10;

const contas: FeaturePlugin = async (app) => {
  app.decorateRequest('user', null);

  // Ordem: origem → sessão → área do organizador.
  app.addHook('onRequest', originCheck);
  app.addHook('onRequest', loadSession);
  app.addHook('onRequest', organizerArea);
  app.addHook('onSend', noStoreWhenLoggedIn);

  app.layout.addNavContributor({
    name: 'contas',
    order: 1000,
    render: (request) => navContribution(request.user ?? null),
  });

  registerAccountRoutes(app, { dummyPasswordHash: await hashPassword(newSessionToken()) });
};

export default fp(contas, { name: 'contas' });
