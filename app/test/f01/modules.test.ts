import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { discoverFeatureModules, loadFeatureModules } from '../../src/core/modules.js';
import { createTestApp } from '../helpers/app.js';

const FIXTURES_OK = fileURLToPath(new URL('../fixtures/features-ok/', import.meta.url));
const FIXTURES_INVALIDA = fileURLToPath(new URL('../fixtures/features-invalida/', import.meta.url));

describe('F01 carregamento de módulos de feature', () => {
  it('carrega todos os módulos da pasta e registra as rotas de cada um', async () => {
    const { app } = await createTestApp({ featuresDir: FIXTURES_OK });
    for (const modulo of ['alfa', 'beta', 'gama']) {
      const response = await app.inject({ method: 'GET', url: `/${modulo}` });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ modulo });
    }
  });

  it('ordena por loadOrder e desempata pelo nome da pasta', async () => {
    const modules = await discoverFeatureModules(FIXTURES_OK);
    expect(modules.map((mod) => [mod.name, mod.loadOrder])).toEqual([
      ['beta', 10],
      ['alfa', 20],
      ['gama', 20],
    ]);
    const { app } = await createTestApp({ featuresDir: FIXTURES_OK });
    expect(app.featureModules).toEqual(['beta', 'alfa', 'gama']);
  });

  it('ignora pastas iniciadas por _', async () => {
    const { app } = await createTestApp({ featuresDir: FIXTURES_OK });
    expect(app.featureModules).not.toContain('_ignorada');
    const response = await app.inject({ method: 'GET', url: '/ignorada' });
    expect(response.statusCode).toBe(404);
  });

  it('falha com o nome do módulo quando falta o export default', async () => {
    const app = Fastify({ logger: false });
    try {
      await expect(loadFeatureModules(app, FIXTURES_INVALIDA)).rejects.toThrow(
        /^Módulo de feature inválido: sem-default \(.+\)$/,
      );
      await expect(createTestApp({ featuresDir: FIXTURES_INVALIDA })).rejects.toThrow(
        'Módulo de feature inválido: sem-default',
      );
    } finally {
      await app.close();
    }
  });

  it('a aplicação real carrega os módulos health e vitrine', async () => {
    const { app } = await createTestApp();
    // Outras features acrescentam módulos; health e vitrine precisam estar entre eles.
    expect(app.featureModules).toEqual(expect.arrayContaining(['health', 'vitrine']));
  });
});
