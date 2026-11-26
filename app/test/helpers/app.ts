// Aplicação para testes com app.inject(): buildApp com configuração de teste e o banco de teste.
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadConfig, type AppConfig, type EnvSource } from '../../src/config.js';
import { createPool, type Db } from '../../src/db/pool.js';
import { testDb } from './db.js';

export interface TestAppOptions {
  /** Variáveis de ambiente extras (sobrescrevem process.env e o NODE_ENV=test padrão). */
  config?: EnvSource;
  /** Pasta de módulos de feature (padrão: src/features). */
  featuresDir?: string;
  /** Tarefas em segundo plano (padrão: false). */
  backgroundJobs?: boolean;
}

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  config: AppConfig;
}

const openApps: FastifyInstance[] = [];
const ownedPools: Db[] = [];

export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', ...options.config });
  // DATABASE_URL própria (ex.: banco inacessível) → pool próprio; senão, o pool de teste do arquivo.
  let db: Db;
  if (options.config?.DATABASE_URL !== undefined) {
    db = createPool(config);
    ownedPools.push(db);
  } else {
    db = testDb();
  }
  const app = await buildApp({
    config,
    db,
    featuresDir: options.featuresDir,
    backgroundJobs: options.backgroundJobs ?? false,
  });
  openApps.push(app);
  return { app, db, config };
}

/** Fecha as apps criadas por createTestApp (chamado no afterEach do setup). */
export async function closeTestApps(): Promise<void> {
  while (openApps.length > 0) {
    await openApps.pop()?.close();
  }
  while (ownedPools.length > 0) {
    await ownedPools.pop()?.end();
  }
}
