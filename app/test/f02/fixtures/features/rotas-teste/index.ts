// Rotas de teste fora da área do organizador, usando os guardas públicos do módulo contas.
// /teste/chamadas conta quantas vezes um handler protegido executou (o guarda que bloqueia
// não pode deixar o handler rodar).
import type { FeaturePlugin } from '../../../../../src/core/modules.js';
import {
  currentUser,
  requireOrganizer,
  requireParticipant,
} from '../../../../../src/features/contas/public.js';

const rotasTeste: FeaturePlugin = async (app) => {
  let calls = 0;
  const who = (request: Parameters<typeof currentUser>[0]) => {
    calls += 1;
    const user = currentUser(request);
    return { id: user.id, role: user.role };
  };

  app.get('/teste/chamadas', async () => ({ calls }));
  app.get('/teste/organizador', { preHandler: requireOrganizer }, async (request) => who(request));
  app.get('/teste/participante', { preHandler: requireParticipant() }, async (request) => who(request));
  app.post('/teste/participante', { preHandler: requireParticipant() }, async (request) => who(request));
  app.post(
    '/teste/participante-volta',
    { preHandler: requireParticipant({ returnTo: () => '/eventos/evt_teste?x=1', allowOrganizer: true }) },
    async (request) => who(request),
  );
  app.get('/teste/sem-guarda', async (request) => who(request));
  app.post('/teste/formulario', async () => ({ ok: true }));
};

export default rotasTeste;
