// Layout HTML comum a todas as páginas e registro das contribuições de navegação.
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { html, raw, type SafeHtml } from './html.js';

export interface NavContributor {
  /** Nome único da contribuição (ex.: 'sessao'). */
  name: string;
  /** Menor aparece antes. */
  order: number;
  render(request: FastifyRequest): SafeHtml | Promise<SafeHtml>;
}

export type PageMessageKind = 'success' | 'error' | 'info';

export interface PageMessage {
  kind: PageMessageKind;
  text: string;
}

export interface PageOptions {
  /** Título da página (o layout acrescenta " · Catraca"). */
  title: string;
  content: SafeHtml;
  messages?: readonly PageMessage[];
  status?: number;
}

const STYLE = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5;color:#1f2328;background:#f6f8fa}
header{background:#1f2328;color:#fff}
nav{max-width:960px;margin:0 auto;padding:.75rem 1rem;display:flex;flex-wrap:wrap;gap:1rem;align-items:center}
nav a{color:#fff;text-decoration:none}
nav a:hover{text-decoration:underline}
nav .marca{font-weight:700;margin-right:auto}
main{max-width:960px;margin:0 auto;padding:1.5rem 1rem}
h1{margin-top:0}
.msg{padding:.75rem 1rem;border-radius:6px;border:1px solid}
.msg-success{background:#dafbe1;border-color:#4ac26b}
.msg-error{background:#ffebe9;border-color:#ff8182}
.msg-info{background:#ddf4ff;border-color:#54aeff}
table{border-collapse:collapse;width:100%;background:#fff}
th,td{text-align:left;padding:.5rem;border-bottom:1px solid #d0d7de}
form{display:grid;gap:.75rem;max-width:480px}
label{display:grid;gap:.25rem}
input,select,button{font:inherit;padding:.5rem}
button{cursor:pointer}
`;

function renderMessage(message: PageMessage): SafeHtml {
  const role = message.kind === 'error' ? 'alert' : 'status';
  return html`<p class="msg msg-${message.kind}" role="${role}">${message.text}</p>`;
}

export class LayoutRegistry {
  readonly #contributors: NavContributor[] = [];

  addNavContributor(contributor: NavContributor): void {
    if (this.#contributors.some((c) => c.name === contributor.name)) {
      throw new Error(`Contribuição de navegação repetida: ${contributor.name}`);
    }
    this.#contributors.push(contributor);
  }

  /** Contribuições na ordem de exibição (order crescente; empate pela ordem de registro). */
  navContributors(): readonly NavContributor[] {
    return this.#contributors
      .map((contributor, index) => ({ contributor, index }))
      .sort((a, b) => a.contributor.order - b.contributor.order || a.index - b.index)
      .map(({ contributor }) => contributor);
  }

  async renderPage(request: FastifyRequest, options: PageOptions): Promise<string> {
    const navItems: SafeHtml[] = [];
    for (const contributor of this.navContributors()) {
      navItems.push(await contributor.render(request));
    }
    const messages = (options.messages ?? []).map(renderMessage);
    const page = html`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${options.title} · Catraca</title>
<style>${raw(STYLE)}</style>
</head>
<body>
<header>
<nav aria-label="Navegação principal" data-area="navegacao">
<a href="/" class="marca">Catraca</a>
${navItems}
</nav>
</header>
<main>
${messages}
${options.content}
</main>
</body>
</html>
`;
    return page.value;
  }
}

/** Adiciona reply.page(...) a todas as rotas (registrado na raiz com fastify-plugin). */
export const layoutPlugin = fp(
  async (app) => {
    app.decorateReply('page', async function page(this: FastifyReply, options: PageOptions) {
      const body = await app.layout.renderPage(this.request, options);
      return this.code(options.status ?? 200)
        .type('text/html; charset=utf-8')
        .send(body);
    });
  },
  { name: 'catraca-layout' },
);
