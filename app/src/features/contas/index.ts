// Módulo contas: identidade (sessão por cookie assinado guardada no banco), cadastro, login, saída,
// navegação de conta e proteções. Envolvido por fastify-plugin: hooks e decorator valem para todas
// as rotas de todos os módulos (e para o 404 da raiz). Carrega antes dos demais (loadOrder 10).
import './types.js';
import fp from 'fastify-plugin';
import type { FeaturePlugin } from '../../core/modules.js';
import { loadSession, noStoreWhenLoggedIn } from './guards.js';

export const loadOrder = 10;

const contas: FeaturePlugin = async (app) => {
  app.decorateRequest('user', null);

  app.addHook('onRequest', loadSession);
  app.addHook('onSend', noStoreWhenLoggedIn);
};

export default fp(contas, { name: 'contas' });
