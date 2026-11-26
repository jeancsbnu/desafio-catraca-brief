// GET / — vitrine provisória (vazia). A F06 assume este módulo e entrega o conteúdo real.
import { html } from '../../core/html.js';
import type { FeaturePlugin } from '../../core/modules.js';

const vitrine: FeaturePlugin = async (app) => {
  app.get('/', async (_request, reply) => {
    return reply.page({
      title: 'Eventos à venda',
      content: html`<h1>Eventos à venda</h1>
<p>Nenhum evento à venda no momento.</p>`,
    });
  });
};

export default vitrine;
