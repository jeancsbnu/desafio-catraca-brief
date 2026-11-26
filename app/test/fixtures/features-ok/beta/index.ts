// Módulo de exemplo dos testes do loader: carrega antes (loadOrder menor) e tem rotas que lançam erro.
import type { FeaturePlugin } from '../../../../src/core/modules.js';

export const loadOrder = 10;

const beta: FeaturePlugin = async (app) => {
  app.get('/beta', async () => ({ modulo: 'beta' }));
  app.get('/beta/erro', async () => {
    throw new Error('segredo interno do beta: SELECT * FROM users');
  });
  app.get('/api/beta/erro', async () => {
    throw new Error('segredo interno da API beta');
  });
};

export default beta;
