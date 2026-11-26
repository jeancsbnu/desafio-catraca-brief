// Módulo de exemplo dos testes do loader: mesmo loadOrder do alfa (desempate pelo nome da pasta).
import type { FeaturePlugin } from '../../../../src/core/modules.js';

export const loadOrder = 20;

const gama: FeaturePlugin = async (app) => {
  app.get('/gama', async () => ({ modulo: 'gama' }));
};

export default gama;
