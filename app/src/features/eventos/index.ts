// Módulo eventos (F04): tabela events e consultas. As rotas da área do organizador e os pontos de
// extensão entram nas fases seguintes.
import './types.js';
import fp from 'fastify-plugin';

/** Depois de contas (10) e gateway (20); antes das consumidoras (F05 em diante, > 30). */
export const loadOrder = 30;

export default fp(async () => {}, { name: 'eventos', dependencies: ['contas'] });
