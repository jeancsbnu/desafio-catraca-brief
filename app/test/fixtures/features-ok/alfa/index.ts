// Módulo de exemplo dos testes do loader: rota simples e eco de formulário.
import type { FeaturePlugin } from '../../../../src/core/modules.js';

export const loadOrder = 20;

const alfa: FeaturePlugin = async (app) => {
  app.get('/alfa', async () => ({ modulo: 'alfa' }));
  app.post('/alfa/eco', async (request) => ({ recebido: request.body }));
};

export default alfa;
