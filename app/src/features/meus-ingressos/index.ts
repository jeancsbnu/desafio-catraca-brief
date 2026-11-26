// GET /meus-ingressos — página mínima do participante. A F06 assume este módulo e troca o conteúdo
// pelos ingressos, mantendo o <h1>Meus ingressos</h1> e o requireParticipant().
import { html } from '../../core/html.js';
import type { FeaturePlugin } from '../../core/modules.js';
import { requireParticipant } from '../contas/public.js';

const meusIngressos: FeaturePlugin = async (app) => {
  app.get('/meus-ingressos', { preHandler: requireParticipant() }, async (_request, reply) => {
    return reply.page({
      title: 'Meus ingressos',
      content: html`<h1>Meus ingressos</h1><p>Você ainda não tem ingressos.</p>`,
    });
  });
};

export default meusIngressos;
