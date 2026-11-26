// Funções comuns dos comandos do host (npm run up / down / gates).
// Só módulos nativos do Node (compatível com Node.js >= 20): nada de npm install na raiz.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raiz do repositório, descoberta pelo caminho deste arquivo (scripts/lib/). */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const COMPOSE_FILE = join(ROOT, 'compose.yaml');
export const GATES_COMPOSE_FILE = join(ROOT, 'compose.gates.yaml');

const DEFAULT_PROJECT = 'catraca';
const DEFAULT_PORT = 3000;
const MAX_CAPTURE = 2 * 1024 * 1024;

/** Linhas com prefixo: [up] ..., [down] ..., [gates] ... */
export function createLogger(prefix) {
  return {
    info(message) {
      process.stdout.write(`[${prefix}] ${message}\n`);
    },
    error(message) {
      process.stderr.write(`[${prefix}] ${message}\n`);
    },
  };
}

/** Lê o .env local (opcional): KEY=VALUE, com comentários (#), "export " e aspas opcionais. */
export function readDotEnv(file = join(ROOT, '.env')) {
  const values = {};
  if (!existsSync(file)) return values;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return values;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    values[match[1]] = value;
  }
  return values;
}

/**
 * Projeto do Compose e porta: variável do shell > .env > padrão.
 * Valor inválido → mensagem com o prefixo do comando e código 1.
 */
export function resolveSettings(log) {
  const dotenv = readDotEnv();
  const pick = (key) => {
    const fromShell = process.env[key];
    if (fromShell !== undefined && fromShell.trim() !== '') return fromShell.trim();
    const fromFile = dotenv[key];
    if (fromFile !== undefined && fromFile.trim() !== '') return fromFile.trim();
    return undefined;
  };

  const project = pick('COMPOSE_PROJECT_NAME') ?? DEFAULT_PROJECT;
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(project)) {
    log.error(`COMPOSE_PROJECT_NAME inválido: ${project}`);
    process.exit(1);
  }

  const portText = pick('CATRACA_PORT') ?? String(DEFAULT_PORT);
  const port = /^\d+$/.test(portText) ? Number(portText) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    log.error(`CATRACA_PORT inválida: ${portText}`);
    process.exit(1);
  }

  return { project, port, gatesProject: `${project}-gates` };
}

/** Ambiente dos processos do Compose, com os valores já resolvidos. */
export function composeEnv(settings) {
  return {
    ...process.env,
    COMPOSE_PROJECT_NAME: settings.project,
    CATRACA_PORT: String(settings.port),
  };
}

/**
 * Executa um processo a partir da raiz do repositório.
 * mirror: espelha stdout/stderr no terminal; capture: devolve a saída (stdout + stderr) em output.
 */
export function run(command, args, { env = process.env, mirror = true, capture = false } = {}) {
  return new Promise((resolvePromise) => {
    let output = '';
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolvePromise({ output, stdout, stderr, ...result });
    };

    let child;
    try {
      child = spawn(command, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      finish({ code: 127, signal: null, error });
      return;
    }

    const collect = (target) => (chunk) => {
      if (mirror) target.write(chunk);
      if (!capture) return;
      const text = chunk.toString('utf8');
      output = (output + text).slice(-MAX_CAPTURE);
      if (target === process.stdout) stdout = (stdout + text).slice(-MAX_CAPTURE);
      else stderr = (stderr + text).slice(-MAX_CAPTURE);
    };
    child.stdout.on('data', collect(process.stdout));
    child.stderr.on('data', collect(process.stderr));
    child.on('error', (error) => finish({ code: 127, signal: null, error }));
    child.on('close', (code, signal) => finish({ code: code ?? 1, signal }));
  });
}

function firstLine(text) {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== '') ?? ''
  );
}

/**
 * Confere o Docker (daemon acessível) e o Compose v2. Se faltar algo, imprime
 * "[<cmd>] Docker não está disponível: <detalhe>" e termina com código 1.
 */
export async function checkDocker(log, { hint = false } = {}) {
  const fail = (detail) => {
    log.error(`Docker não está disponível: ${detail}`);
    if (hint) log.error('Inicie o Docker (com o Compose v2) e rode o comando de novo.');
    process.exit(1);
  };

  const server = await run('docker', ['version', '--format', '{{.Server.Version}}'], {
    mirror: false,
    capture: true,
  });
  if (server.error && server.error.code === 'ENOENT') {
    fail('o comando docker não foi encontrado no PATH');
  }
  if (server.code !== 0 || server.stdout.trim() === '') {
    fail(firstLine(server.stderr) || firstLine(server.output) || `docker version terminou com código ${server.code}`);
  }

  const compose = await run('docker', ['compose', 'version', '--short'], { mirror: false, capture: true });
  if (compose.code !== 0) {
    fail('Docker Compose v2 não encontrado (docker compose version falhou)');
  }
  const version = compose.stdout.trim().replace(/^v/, '');
  const major = Number.parseInt(version, 10);
  if (!Number.isInteger(major) || major < 2) {
    fail(`é preciso o Docker Compose v2 ou mais novo (encontrado: ${version || 'desconhecido'})`);
  }
}

/** true se a porta aceita bind em 0.0.0.0 agora (só EADDRINUSE conta como ocupada). */
export function isPortFree(port) {
  return new Promise((resolvePromise) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (error) => resolvePromise(error.code !== 'EADDRINUSE'));
    server.listen({ port, host: '0.0.0.0', exclusive: true }, () => {
      server.close(() => resolvePromise(true));
    });
  });
}

/** true se o serviço do projeto está rodando. */
export async function isServiceRunning(composeArgs, service, env) {
  const result = await run('docker', [...composeArgs, 'ps', '--status', 'running', '--quiet', service], {
    env,
    mirror: false,
    capture: true,
  });
  return result.code === 0 && result.stdout.trim() !== '';
}

function getHealth(port) {
  return new Promise((resolvePromise) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => resolvePromise(response.statusCode === 200 && body.includes('"status":"ok"')));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', () => resolvePromise(false));
  });
}

/** Espera GET /health responder 200 {"status":"ok"} no host, até o limite. */
export async function waitForHostHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await getHealth(port)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
}
