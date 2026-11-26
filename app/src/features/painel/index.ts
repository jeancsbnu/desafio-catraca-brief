// Módulo painel (F09): os números do evento (R12) na página de gestão da F04. Sem rotas, sem
// tabelas e sem escrita. Envolvido por fastify-plugin (nome painel), depois de eventos e ingressos.
import fp from 'fastify-plugin';

/** Depois de eventos (30), ingressos (40) e checkin (50); antes dos módulos com o padrão (100). */
export const loadOrder = 60;

export default fp(async () => {}, { name: 'painel', dependencies: ['eventos', 'ingressos'] });
