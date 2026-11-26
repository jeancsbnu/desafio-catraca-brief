// Construção da aplicação Fastify (sem escutar porta): recursos compartilhados, respostas padrão
// e carregamento automático dos módulos de feature.
import './core/types.js';
import { fileURLToPath } from 'node:url';
import formbody from '@fastify/formbody';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import type { Db } from './db/pool.js';
import { registerErrorHandlers } from './core/errors.js';
import { LayoutRegistry, layoutPlugin } from './core/layout.js';
import { loadFeatureModules } from './core/modules.js';

export const DEFAULT_FEATURES_DIR = fileURLToPath(new URL('./features/', import.meta.url));

export interface BuildAppOptions {
  config: AppConfig;
  db: Db;
  /** Pasta dos módulos de feature (padrão: src/features ou dist/features). */
  featuresDir?: string;
  /** Liga as tarefas em segundo plano dos módulos (padrão: true). */
  backgroundJobs?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, db } = options;
  const app = Fastify({
    logger: { level: config.logLevel },
  });

  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('layout', new LayoutRegistry());
  app.decorate('backgroundJobs', options.backgroundJobs ?? true);
  app.decorate('featureModules', [] as readonly string[]);

  await app.register(formbody);
  await app.register(layoutPlugin);
  registerErrorHandlers(app);

  app.featureModules = await loadFeatureModules(app, options.featuresDir ?? DEFAULT_FEATURES_DIR);
  return app;
}
