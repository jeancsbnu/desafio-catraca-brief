// npm run up — constrói e sobe a Catraca (banco + aplicação) e espera ficar saudável.
// A aplicação roda migrations e seed ao iniciar.
import {
  COMPOSE_FILE,
  checkDocker,
  composeEnv,
  createLogger,
  isPortFree,
  isServiceRunning,
  resolveSettings,
  run,
  waitForHostHealth,
} from './lib/harness.mjs';

const log = createLogger('up');
const settings = resolveSettings(log);
const { project, port } = settings;

function portInUse() {
  log.error(
    `Porta ${port} em uso. Libere a porta ou escolha outra com a variável CATRACA_PORT ` +
      `(ex.: CATRACA_PORT=${port === 3001 ? 3002 : 3001} npm run up, ou CATRACA_PORT=${port === 3001 ? 3002 : 3001} no arquivo .env).`,
  );
  process.exit(1);
}

await checkDocker(log, { hint: true });

const env = composeEnv(settings);
const compose = ['compose', '-f', COMPOSE_FILE, '-p', project];

// Checagem prévia da porta (pulada se a aplicação deste projeto já está no ar e ocupa a porta).
if (!(await isServiceRunning(compose, 'app', env)) && !(await isPortFree(port))) {
  portInUse();
}

log.info(`Construindo e subindo a Catraca (projeto Compose "${project}", porta ${port})...`);
const up = await run('docker', [...compose, 'up', '-d', '--build', '--wait', '--wait-timeout', '120'], {
  env,
  capture: true,
});

if (up.code !== 0) {
  if (/port is already allocated|address already in use/i.test(up.output)) {
    portInUse();
  }
  log.error(`Falha ao subir a Catraca (docker compose terminou com código ${up.code}).`);
  log.error('Últimas linhas do log da aplicação:');
  await run('docker', [...compose, 'logs', '--no-color', '--no-log-prefix', '--tail', '80', 'app'], { env });
  process.exit(1);
}

if (!(await waitForHostHealth(port, 10_000))) {
  log.error(`A aplicação ficou saudável no container, mas http://localhost:${port}/health não respondeu no host.`);
  process.exit(1);
}

log.info('Catraca no ar.');
log.info(`$WEB = http://localhost:${port}`);
log.info(`$API = http://localhost:${port}`);
log.info('Contas da seed e chave de parceiro: README.md, seção "Credenciais".');
