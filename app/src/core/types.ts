// Tipos que a aplicação acrescenta ao Fastify. Cada feature declara os próprios no seu módulo.
import type { AppConfig } from '../config.js';
import type { Db } from '../db/pool.js';
import type { LayoutRegistry, PageOptions } from './layout.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Configuração efetiva (src/config.ts). */
    config: AppConfig;
    /** Pool de conexões do PostgreSQL. */
    db: Db;
    /** Layout comum e contribuições de navegação. */
    layout: LayoutRegistry;
    /** true no processo da aplicação; false nos testes (tarefas em segundo plano desligadas). */
    backgroundJobs: boolean;
    /** Nomes dos módulos de feature carregados, na ordem. */
    featureModules: readonly string[];
  }

  interface FastifyReply {
    /** Responde uma página HTML completa dentro do layout comum. */
    page(options: PageOptions): Promise<FastifyReply>;
  }
}

export {};
