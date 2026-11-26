// npm run gates [-- <filtros do Vitest>] — lint, typecheck e testes em container, num projeto
// do Compose separado (<projeto>-gates), com banco próprio e sem portas no host.
// Termina com 0 só se tudo passar. A limpeza do projeto de gates roda sempre.
import {
  GATES_COMPOSE_FILE,
  checkDocker,
  composeEnv,
  createLogger,
  resolveSettings,
  run,
} from './lib/harness.mjs';

const log = createLogger('gates');
const settings = resolveSettings(log);

await checkDocker(log);

const env = composeEnv(settings);
const compose = ['compose', '-f', GATES_COMPOSE_FILE, '-p', settings.gatesProject];
const filters = process.argv.slice(2);

let interrupted = false;
const onSignal = () => {
  interrupted = true;
};
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

const cleanup = () => run('docker', [...compose, 'down', '-v', '--remove-orphans'], { env, mirror: false, capture: true });

async function finish(code) {
  await cleanup();
  process.exit(interrupted ? 130 : code);
}

log.info(`projeto Compose "${settings.gatesProject}" (banco próprio, sem portas no host)`);

// Sobras de uma execução anterior interrompida.
await cleanup();
if (interrupted) await finish(130);

const build = await run('docker', [...compose, 'build', 'gates'], { env });
if (interrupted) await finish(130);
if (build.code !== 0) {
  log.error('resultado: FALHOU (não foi possível construir a imagem dos gates)');
  await finish(1);
}

const gates = await run('docker', [...compose, 'run', '--rm', '-T', 'gates', 'node', 'tools/gates.mjs', ...filters], {
  env,
  capture: true,
});
if (interrupted) await finish(130);

if (!/^\[gates\] resultado: /m.test(gates.output)) {
  log.error(`resultado: FALHOU (os gates não terminaram; docker compose terminou com código ${gates.code})`);
  await finish(1);
}

await finish(gates.code === 0 ? 0 : 1);
