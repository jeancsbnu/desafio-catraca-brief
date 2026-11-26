// GET /health — saúde da aplicação, incluindo a conexão com o banco.
import type { FeaturePlugin } from '../../core/modules.js';

export const HEALTH_DB_TIMEOUT_MS = 2000;

async function databaseResponds(app: Parameters<FeaturePlugin>[0]): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), HEALTH_DB_TIMEOUT_MS);
  });
  const query = app.db.query('SELECT 1').then(
    () => true,
    (error: unknown) => {
      app.log.warn({ err: error }, 'health: banco de dados não respondeu');
      return false;
    },
  );
  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const health: FeaturePlugin = async (app) => {
  app.get('/health', async (_request, reply) => {
    void reply.header('cache-control', 'no-store');
    if (await databaseResponds(app)) {
      return reply.code(200).send({ status: 'ok' });
    }
    return reply.code(503).send({ status: 'erro', motivo: 'banco de dados indisponível' });
  });
};

export default health;
