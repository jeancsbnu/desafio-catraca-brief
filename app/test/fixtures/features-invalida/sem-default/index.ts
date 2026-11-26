// Módulo inválido de propósito: não tem export default.
import type { FeaturePlugin } from '../../../../src/core/modules.js';

export const loadOrder = 5;

export const plugin: FeaturePlugin = async (app) => {
  app.get('/sem-default', async () => ({ ok: true }));
};
