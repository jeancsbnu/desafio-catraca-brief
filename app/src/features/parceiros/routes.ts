// Escopo /api/partner (spec 5.1): tudo da API de parceiros vive aqui, registrado nesta ordem —
// leitor de corpo, chave (onRequest), cabeçalhos (onSend), tratador de erros, rotas, coringas e
// tratador 404. A chave roda antes de qualquer leitura de corpo, parâmetro ou banco; o corpo chega
// ao handler como texto, para que JSON malformado e Content-Type errado virem 422 (nunca o 400/415
// padrão do Fastify).
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requirePartnerKey } from './auth.js';
import { PURCHASE_BODY_LIMIT } from './body.js';
import { sendPartnerError } from './responses.js';

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' && Number.isInteger(status) ? status : undefined;
}

/** Texto curto para o log (o id vem do caminho, como o parceiro mandou). */
function loggable(value: unknown): string | undefined {
  return typeof value === 'string' ? value.slice(0, 100) : undefined;
}

export async function partnerScope(scope: FastifyInstance): Promise<void> {
  // 1. Corpo: nenhum leitor herdado (JSON, formulário); qualquer Content-Type, inclusive ausente,
  //    chega como texto até 16 KiB. Quem interpreta é o handler (body.ts).
  scope.removeAllContentTypeParsers();
  scope.addContentTypeParser('*', { parseAs: 'string', bodyLimit: PURCHASE_BODY_LIMIT }, (_request, body, done) => {
    done(null, body);
  });

  // 2. Chave antes de tudo (vale para as rotas, os coringas e o tratador 404 do escopo).
  scope.addHook('onRequest', requirePartnerKey(scope.config.partnerApiKey));

  // 3. Status de ingresso nunca vem de cache.
  scope.addHook('onSend', async (_request, reply, payload) => {
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    return payload;
  });

  // 4. Erros: falha na leitura do corpo (4xx do Fastify) → 422; qualquer outro → 500.
  scope.setErrorHandler(async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const status = statusOf(error);
    if (status !== undefined && status >= 400 && status < 500) {
      const params = request.params as { eventId?: unknown } | undefined;
      request.log.info({ eventId: loggable(params?.eventId), motivo: 'leitura' }, 'parceiros: corpo da compra inválido');
      return sendPartnerError(reply, 422, 'invalid_request');
    }
    request.log.error({ err: error }, 'parceiros: erro inesperado');
    return sendPartnerError(reply, 500, 'internal_error');
  });

  // 6. Caminho ou método desconhecido sob /api/partner (sempre depois da chave): 404 not_found.
  const fallback = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    return sendPartnerError(reply, 404, 'not_found');
  };
  scope.all('/*', fallback);
  scope.setNotFoundHandler(fallback);
}
