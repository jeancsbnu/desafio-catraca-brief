// Entrada do processo: configuração → banco → migrations → seed → módulos → servidor.
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { bootError, bootLog, errorMessage } from './core/boot-log.js';
import { PRODUCT_TIMEZONE } from './core/format.js';
import { describeMigrationReport, runMigrations } from './db/migrate.js';
import { createPool, waitForDatabase, type Db } from './db/pool.js';
import { describeSeedReport, runSeed } from './db/seed.js';

type Stage = 'configuração' | 'banco' | 'migrations' | 'seed' | 'módulos' | 'servidor';

const DATABASE_WAIT_MS = 30_000;

let db: Db | undefined;
let app: FastifyInstance | undefined;
let stopping = false;

async function shutdown(code: number): Promise<never> {
  if (!stopping) {
    stopping = true;
    try {
      await app?.close();
    } catch (error) {
      bootError(`erro ao encerrar o servidor: ${errorMessage(error)}`);
    }
    try {
      await db?.end();
    } catch (error) {
      bootError(`erro ao encerrar o pool do banco: ${errorMessage(error)}`);
    }
  }
  process.exit(code);
}

function onSignal(signal: NodeJS.Signals): void {
  bootLog(`${signal} recebido; encerrando...`);
  void shutdown(0);
}

process.once('SIGTERM', onSignal);
process.once('SIGINT', onSignal);

async function start(): Promise<void> {
  let stage: Stage = 'configuração';
  try {
    const config = loadConfig(process.env);
    for (const warning of config.warnings) bootLog(warning);

    stage = 'banco';
    bootLog('conectando ao banco...');
    db = createPool(config);
    await waitForDatabase(db, { timeoutMs: DATABASE_WAIT_MS });

    stage = 'migrations';
    const migrations = await runMigrations(db);
    for (const line of describeMigrationReport(migrations)) bootLog(line);

    stage = 'seed';
    const seed = await runSeed(db);
    bootLog(describeSeedReport(seed));

    stage = 'módulos';
    app = await buildApp({ config, db, backgroundJobs: true });
    bootLog(`módulos: ${app.featureModules.join(', ')}`);

    stage = 'servidor';
    await app.listen({ host: config.host, port: config.port });
    bootLog(`no ar na porta ${config.port} (gateway: ${config.gateway.mode}, fuso: ${PRODUCT_TIMEZONE})`);
  } catch (error) {
    if (stopping) return;
    bootError(`falha na etapa ${stage}: ${errorMessage(error)}`);
    await shutdown(1);
  }
}

await start();
