// Linha de comando de diagnóstico: catraca <comando> [argumentos].
// Cada arquivo em cli/commands/ exportando name, description e run vira um comando.
import { realpathSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ConfigError, loadConfig, type AppConfig, type EnvSource } from '../config.js';
import { BOOT_PREFIX, errorMessage } from '../core/boot-log.js';
import { createPool, type Db } from '../db/pool.js';

export interface CliContext {
  /** Argumentos depois do nome do comando. */
  args: readonly string[];
  config: AppConfig;
  /** Variáveis de ambiente do processo (ou as passadas ao runCli nos testes). */
  env: EnvSource;
  /** Pool do banco, criado só quando acessado (e fechado ao final). */
  readonly db: Db;
  /** Escreve uma linha no stdout. */
  print: (line: string) => void;
  /** Escreve uma linha no stderr. */
  printError: (line: string) => void;
}

export interface CliCommand {
  name: string;
  description: string;
  run: (context: CliContext) => Promise<number>;
}

export interface RunCliOptions {
  env?: EnvSource;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  commandsDir?: string;
}

const EXTENSION = extname(fileURLToPath(import.meta.url)) || '.js';
export const DEFAULT_COMMANDS_DIR = fileURLToPath(new URL('./commands/', import.meta.url));

const HELP: Pick<CliCommand, 'name' | 'description'> = {
  name: 'help',
  description: 'Lista os comandos disponíveis',
};

export async function discoverCommands(dir: string = DEFAULT_COMMANDS_DIR): Promise<CliCommand[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith(EXTENSION) && !file.endsWith(`.d${EXTENSION}`));
  const commands: CliCommand[] = [];
  for (const file of files.sort()) {
    const mod = (await import(pathToFileURL(join(dir, file)).href)) as Partial<CliCommand>;
    if (typeof mod.name !== 'string' || typeof mod.description !== 'string' || typeof mod.run !== 'function') {
      throw new Error(`Comando inválido: ${file} (exporte name, description e run)`);
    }
    commands.push({ name: mod.name, description: mod.description, run: mod.run });
  }
  return commands.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function helpLines(commands: readonly Pick<CliCommand, 'name' | 'description'>[]): string[] {
  const all = [...commands, HELP];
  const width = Math.max(...all.map((command) => command.name.length));
  return ['Comandos disponíveis:', ...all.map((command) => `  ${command.name.padEnd(width)}  ${command.description}`)];
}

export async function runCli(argv: readonly string[], options: RunCliOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const print = options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const printError = options.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  let commands: CliCommand[];
  try {
    commands = await discoverCommands(options.commandsDir);
  } catch (error) {
    printError(`${BOOT_PREFIX} ${errorMessage(error)}`);
    return 1;
  }

  const [name, ...args] = argv;
  if (name === undefined || name === 'help' || name === '--help' || name === '-h') {
    for (const line of helpLines(commands)) print(line);
    return 0;
  }

  const command = commands.find((candidate) => candidate.name === name);
  if (!command) {
    printError(`Comando desconhecido: ${name}`);
    for (const line of helpLines(commands)) printError(line);
    return 2;
  }

  let config: AppConfig;
  try {
    config = loadConfig(env);
  } catch (error) {
    printError(`${BOOT_PREFIX} ${error instanceof ConfigError ? 'configuração inválida: ' : ''}${errorMessage(error)}`);
    return 1;
  }

  let pool: Db | undefined;
  const context: CliContext = {
    args,
    config,
    env,
    get db(): Db {
      pool ??= createPool(config);
      return pool;
    },
    print,
    printError,
  };

  try {
    return await command.run(context);
  } catch (error) {
    printError(`${BOOT_PREFIX} ${name}: ${errorMessage(error)}`);
    return 1;
  } finally {
    await pool?.end();
  }
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  process.exitCode = await runCli(process.argv.slice(2));
}
