// Módulo painel (F09): os números do evento (R12) como uma seção da página de gestão da F04, que só
// é entregue ao dono do evento (R13). Sem rotas, decorators, hooks, tabelas nem escrita.
// Envolvido por fastify-plugin (nome painel), depois de eventos e ingressos.
import fp from 'fastify-plugin';
import { createPanelSection } from './section.js';

/** Depois de eventos (30), ingressos (40) e checkin (50); antes dos módulos com o padrão (100). */
export const loadOrder = 60;

export default fp(
  async (app) => {
    // Registro no ponto de extensão da F04, no registro do plugin (antes do onReady).
    app.events.addManagementSection(createPanelSection());
  },
  { name: 'painel', dependencies: ['eventos', 'ingressos'] },
);
