// Respostas padrão da raiz para rota inexistente e erro não tratado.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { html } from './html.js';

export function isApiPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return path === '/api' || path.startsWith('/api/');
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' && Number.isInteger(status) ? status : undefined;
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    if (isApiPath(request.url)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.page({
      title: 'Página não encontrada',
      status: 404,
      content: html`<h1>Página não encontrada</h1>
<p><a href="/">Voltar para a página inicial</a></p>`,
    });
  });

  app.setErrorHandler(async (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const status = statusOf(error);
    const clientError = status !== undefined && status >= 400 && status < 500;

    if (clientError) {
      request.log.info({ err: error }, 'requisição inválida');
      if (isApiPath(request.url)) {
        return reply.code(status).send({ error: 'bad_request' });
      }
      return reply.page({
        title: 'Requisição inválida',
        status,
        content: html`<h1>Requisição inválida</h1>
<p><a href="/">Voltar para a página inicial</a></p>`,
      });
    }

    request.log.error({ err: error }, 'erro não tratado');
    if (isApiPath(request.url)) {
      return reply.code(500).send({ error: 'internal_error' });
    }
    return reply.page({
      title: 'Erro',
      status: 500,
      content: html`<h1>Algo deu errado. Tente novamente.</h1>
<p><a href="/">Voltar para a página inicial</a></p>`,
    });
  });
}
