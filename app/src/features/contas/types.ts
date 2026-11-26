// Tipos da identidade do usuário e o campo request.user que o módulo contas acrescenta ao Fastify.

export type Role = 'organizador' | 'participante';

/** Usuário da sessão, lido do banco a cada requisição. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Usuário logado; null para visitante e nos caminhos /api/ e /health. */
    user: SessionUser | null;
  }
}
