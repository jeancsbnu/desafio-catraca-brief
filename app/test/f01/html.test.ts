import { describe, expect, it } from 'vitest';
import { escapeHtml, html, raw } from '../../src/core/html.js';

describe('F01 helper html', () => {
  it('escapa & < > " \' em valores interpolados', () => {
    const value = `<script>alert("x")&'`;
    expect(escapeHtml(value)).toBe('&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;');
    expect(html`<p>${value}</p>`.value).toBe('<p>&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;</p>');
  });

  it('não escapa de novo fragmentos SafeHtml aninhados', () => {
    const inner = html`<strong>${'a & b'}</strong>`;
    expect(html`<p>${inner}</p>`.value).toBe('<p><strong>a &amp; b</strong></p>');
  });

  it('junta arrays e ignora null, undefined e false', () => {
    const items = ['um', '<dois>'].map((item) => html`<li>${item}</li>`);
    const out = html`<ul>${items}</ul>${null}${undefined}${false}${0}${['x', ['y']]}`;
    expect(out.value).toBe('<ul><li>um</li><li>&lt;dois&gt;</li></ul>0xy');
  });

  it('raw insere conteúdo confiável sem escapar', () => {
    expect(html`<div>${raw('<em>ok</em>')}</div>`.value).toBe('<div><em>ok</em></div>');
    expect(String(raw('<b>'))).toBe('<b>');
  });
});
