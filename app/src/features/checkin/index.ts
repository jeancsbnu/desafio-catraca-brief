// Módulo checkin (F08): a seção "Check-in" da página de gestão (F04) e a ação
// POST /organizador/eventos/:id/checkin, que aplica a lista de R10 e marca o ingresso (F05).
// Envolvido por fastify-plugin (nome checkin), depois de contas, eventos e ingressos.
import fp from 'fastify-plugin';
import { registerCheckInRoutes } from './routes.js';
import { CHECKIN_SECTION_NAME, CHECKIN_SECTION_ORDER, renderCheckInSection } from './section.js';

/** Depois de eventos (30) e ingressos (40); antes dos módulos com o padrão (100). */
export const loadOrder = 50;

export default fp(
  async (app) => {
    // Registro no ponto de extensão da F04, no registro do plugin (antes do onReady).
    app.events.addManagementSection({
      name: CHECKIN_SECTION_NAME,
      order: CHECKIN_SECTION_ORDER,
      render: renderCheckInSection,
    });
    registerCheckInRoutes(app);
  },
  { name: 'checkin', dependencies: ['contas', 'eventos', 'ingressos'] },
);
