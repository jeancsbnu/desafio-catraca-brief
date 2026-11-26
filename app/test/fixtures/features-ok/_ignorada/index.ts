// Pasta iniciada por _: o loader ignora (serve para código auxiliar compartilhado de uma feature).
import type { FeaturePlugin } from '../../../../src/core/modules.js';

const ignorada: FeaturePlugin = async (app) => {
  app.get('/ignorada', async () => ({ modulo: 'ignorada' }));
};

export default ignorada;
