// Carregamento automático dos módulos de feature: cada subpasta de src/features/ com um index
// que exporta como default um plugin Fastify (e, opcionalmente, loadOrder).
import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { errorMessage } from './boot-log.js';

/** Tipo do plugin que um módulo de feature exporta como default. */
export type FeaturePlugin = FastifyPluginAsync;

export const DEFAULT_LOAD_ORDER = 100;

export interface FeatureModule {
  name: string;
  loadOrder: number;
  plugin: FeaturePlugin;
}

// A extensão do index segue a do próprio loader: .ts em src/ (testes), .js em dist/ (produção).
const INDEX_EXTENSION = extname(fileURLToPath(import.meta.url)) || '.js';

function invalid(name: string, reason: string): Error {
  return new Error(`Módulo de feature inválido: ${name} (${reason})`);
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function importModule(name: string, dir: string): Promise<FeatureModule> {
  const indexFile = `index${INDEX_EXTENSION}`;
  const indexPath = join(dir, name, indexFile);
  if (!(await exists(indexPath))) {
    throw invalid(name, `${indexFile} não encontrado`);
  }

  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(indexPath).href)) as Record<string, unknown>;
  } catch (error) {
    throw invalid(name, `falha ao importar: ${errorMessage(error)}`);
  }

  const plugin = mod.default;
  if (typeof plugin !== 'function') {
    throw invalid(name, `${indexFile} não exporta um plugin Fastify como default`);
  }

  const order = mod.loadOrder;
  if (order !== undefined && (typeof order !== 'number' || !Number.isFinite(order))) {
    throw invalid(name, 'loadOrder precisa ser um número');
  }

  return {
    name,
    loadOrder: order ?? DEFAULT_LOAD_ORDER,
    plugin: plugin as FeaturePlugin,
  };
}

/** Lista e importa os módulos da pasta, já na ordem de carregamento (loadOrder, depois nome). */
export async function discoverFeatureModules(dir: string): Promise<FeatureModule[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.'))
    .map((entry) => entry.name);

  const modules: FeatureModule[] = [];
  for (const name of names) {
    modules.push(await importModule(name, dir));
  }

  return modules.sort((a, b) => a.loadOrder - b.loadOrder || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Registra cada módulo na aplicação e devolve os nomes carregados, na ordem. */
export async function loadFeatureModules(app: FastifyInstance, dir: string): Promise<string[]> {
  const modules = await discoverFeatureModules(dir);
  for (const mod of modules) {
    try {
      await app.register(mod.plugin);
    } catch (error) {
      throw invalid(mod.name, `falha ao registrar: ${errorMessage(error)}`);
    }
  }
  return modules.map((mod) => mod.name);
}
