// Módulo vitrine (F06; assume a vitrine provisória da F01): GET / com os eventos à venda, a página
// pública do evento (GET /eventos/:id) e a compra pela vitrine (POST /eventos/:id/comprar).
// loadOrder padrão (100): carrega depois de contas (10), eventos (30) e ingressos (40).
import type { FeaturePlugin } from '../../core/modules.js';
import { registerShowcaseRoutes } from './routes.js';

const vitrine: FeaturePlugin = async (app) => {
  // app.events (F04) é conferido no registro. app.tickets (F05) é conferido na compra: a aplicação
  // base dos testes de F03/F04 (test/fixtures/features-base, sem o módulo ingressos) carrega este
  // módulo real.
  if (!app.hasDecorator('events')) {
    throw new Error('vitrine: o módulo eventos (F04) precisa carregar antes');
  }
  registerShowcaseRoutes(app);
};

export default vitrine;
