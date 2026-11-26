// Chave de parceiro (spec 5.2): cabeçalho X-Api-Key conferido num hook onRequest do escopo
// /api/partner, antes da leitura do corpo, dos parâmetros e do banco. Comparação em tempo constante:
// SHA-256 do valor recebido e da chave configurada (dois buffers de 32 bytes, qualquer que seja o
// tamanho do valor recebido) com timingSafeEqual. O log nunca leva o valor recebido nem a chave.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendPartnerError } from './responses.js';

/** Nome do cabeçalho como o Node o entrega (nomes de cabeçalho não diferenciam maiúsculas). */
export const PARTNER_KEY_HEADER = 'x-api-key';

/** SHA-256 do texto em UTF-8. */
export function digestKey(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Verdadeiro só para um texto não vazio cujo digest é igual ao esperado; nunca lança. */
export function partnerKeyMatches(received: unknown, expectedDigest: Buffer): boolean {
  if (typeof received !== 'string' || received === '') return false;
  const digest = digestKey(received);
  return digest.length === expectedDigest.length && timingSafeEqual(digest, expectedDigest);
}

/** A URL sem a query string (o que vai para o log). */
export function pathOf(url: string): string {
  const index = url.indexOf('?');
  return index === -1 ? url : url.slice(0, index);
}

/** Hook onRequest do escopo: chave ausente ou inválida → 401 {"error":"unauthorized"} e fim. */
export function requirePartnerKey(expectedKey: string) {
  const expectedDigest = digestKey(expectedKey);
  return async function partnerKeyHook(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
    const received = request.headers[PARTNER_KEY_HEADER];
    if (partnerKeyMatches(received, expectedDigest)) return undefined;
    request.log.warn(
      {
        motivo: received === undefined || received === '' ? 'ausente' : 'invalida',
        method: request.method,
        caminho: pathOf(request.url),
      },
      'parceiros: requisição sem chave válida',
    );
    return sendPartnerError(reply, 401, 'unauthorized');
  };
}
