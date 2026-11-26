// Módulo parceiros (F07): a API de parceiros do contrato fixo do brief, sob /api/partner. Tudo
// (chave, leitor de corpo, erros, rotas) fica num escopo encapsulado; nenhum hook, decorator ou rota
// fora dele. Compra sempre por app.tickets.purchase com channel 'api' (F05); listagem pela definição
// única de "à venda" da F04. Sem tabela, migration ou SQL próprio; nenhuma outra feature importa daqui.
import fp from 'fastify-plugin';
import { partnerScope } from './routes.js';

/** Prefixo das três rotas do contrato fixo. */
export const PARTNER_API_PREFIX = '/api/partner';

export default fp(
  async (app) => {
    await app.register(partnerScope, { prefix: PARTNER_API_PREFIX });
  },
  { name: 'parceiros', dependencies: ['eventos', 'ingressos'], encapsulate: true },
);
