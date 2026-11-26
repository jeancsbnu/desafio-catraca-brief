// npm run down — remove os containers e a rede da Catraca; preserva o volume do banco.
// Também remove sobras do projeto de gates. Idempotente: sem nada no ar, termina com 0.
import {
  COMPOSE_FILE,
  GATES_COMPOSE_FILE,
  checkDocker,
  composeEnv,
  createLogger,
  resolveSettings,
  run,
} from './lib/harness.mjs';

const log = createLogger('down');
const settings = resolveSettings(log);

await checkDocker(log);

const env = composeEnv(settings);
log.info(`Derrubando a Catraca (projeto Compose "${settings.project}")...`);

const down = await run('docker', ['compose', '-f', COMPOSE_FILE, '-p', settings.project, 'down', '--remove-orphans'], {
  env,
});
if (down.code !== 0) {
  log.error(`Falha ao derrubar a Catraca (docker compose terminou com código ${down.code}).`);
  process.exit(1);
}

// Sobras dos gates (normalmente já removidas pelo próprio npm run gates), em silêncio.
await run(
  'docker',
  ['compose', '-f', GATES_COMPOSE_FILE, '-p', settings.gatesProject, 'down', '-v', '--remove-orphans'],
  { env, mirror: false, capture: true },
);

log.info('Pronto: containers e rede removidos; volume do banco preservado.');
