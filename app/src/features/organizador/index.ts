// GET /organizador — página mínima da área do organizador. A F04 assume este módulo e troca o
// conteúdo pela lista de eventos, mantendo o <h1>Área do organizador</h1> e o requireOrganizer.
import { html } from '../../core/html.js';
import type { FeaturePlugin } from '../../core/modules.js';
import { requireOrganizer } from '../contas/public.js';

const organizador: FeaturePlugin = async (app) => {
  app.get('/organizador', { preHandler: requireOrganizer }, async (_request, reply) => {
    return reply.page({
      title: 'Área do organizador',
      content: html`<h1>Área do organizador</h1><p>Os seus eventos vão aparecer aqui.</p>`,
    });
  });
};

export default organizador;
