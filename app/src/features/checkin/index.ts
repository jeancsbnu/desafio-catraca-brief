// Módulo checkin (F08): a seção "Check-in" da página de gestão (F04) e a ação
// POST /organizador/eventos/:id/checkin, que aplica a lista de R10 e marca o ingresso (F05).
// Envolvido por fastify-plugin (nome checkin), depois de contas, eventos e ingressos.
import fp from 'fastify-plugin';

/** Depois de eventos (30) e ingressos (40); antes dos módulos com o padrão (100). */
export const loadOrder = 50;

export default fp(async () => {}, { name: 'checkin', dependencies: ['contas', 'eventos', 'ingressos'] });
