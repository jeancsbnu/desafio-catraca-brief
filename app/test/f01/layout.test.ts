import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { html } from '../../src/core/html.js';
import { LayoutRegistry } from '../../src/core/layout.js';

const request = {} as FastifyRequest;

describe('F01 layout comum', () => {
  it('página tem lang pt-BR, título com · Catraca e navegação com link para /', async () => {
    const layout = new LayoutRegistry();
    const page = await layout.renderPage(request, { title: 'Teste <1>', content: html`<h1>Oi</h1>` });
    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page).toContain('<html lang="pt-BR">');
    expect(page).toContain('<meta charset="utf-8">');
    expect(page).toContain('<title>Teste &lt;1&gt; · Catraca</title>');
    expect(page).toMatch(/<nav aria-label="Navegação principal" data-area="navegacao">\s*<a href="\/" class="marca">Catraca<\/a>/);
    expect(page).toMatch(/<main>[\s\S]*<h1>Oi<\/h1>[\s\S]*<\/main>/);
  });

  it('contribuições de navegação aparecem na ordem de order', async () => {
    const layout = new LayoutRegistry();
    layout.addNavContributor({ name: 'segunda', order: 20, render: () => html`<a href="/b">B</a>` });
    layout.addNavContributor({ name: 'primeira', order: 10, render: async () => html`<a href="/a">A</a>` });
    const page = await layout.renderPage(request, { title: 'T', content: html`` });
    const marca = page.indexOf('class="marca"');
    const a = page.indexOf('href="/a"');
    const b = page.indexOf('href="/b"');
    expect(marca).toBeGreaterThan(-1);
    expect(a).toBeGreaterThan(marca);
    expect(b).toBeGreaterThan(a);
    expect(layout.navContributors().map((c) => c.name)).toEqual(['primeira', 'segunda']);
  });

  it('rejeita contribuição de navegação com nome repetido', () => {
    const layout = new LayoutRegistry();
    layout.addNavContributor({ name: 'sessao', order: 10, render: () => html`` });
    expect(() => layout.addNavContributor({ name: 'sessao', order: 20, render: () => html`` })).toThrow(
      'Contribuição de navegação repetida: sessao',
    );
  });

  it('mensagens aparecem antes do conteúdo e são escapadas', async () => {
    const layout = new LayoutRegistry();
    const page = await layout.renderPage(request, {
      title: 'T',
      content: html`<p id="conteudo">conteúdo</p>`,
      messages: [
        { kind: 'success', text: 'Salvo <ok>' },
        { kind: 'error', text: 'Falhou & pronto' },
      ],
    });
    expect(page).toContain('<p class="msg msg-success" role="status">Salvo &lt;ok&gt;</p>');
    expect(page).toContain('<p class="msg msg-error" role="alert">Falhou &amp; pronto</p>');
    expect(page.indexOf('msg-success')).toBeLessThan(page.indexOf('msg-error'));
    expect(page.indexOf('msg-error')).toBeLessThan(page.indexOf('id="conteudo"'));
  });
});
