// HTML do módulo contas: formulários de cadastro e login, páginas de bloqueio e navegação de conta.
// Tudo pelo template html da F01 (valores escapados). Sem validação do navegador: as mensagens
// exibidas são sempre as do servidor.
import { html, type SafeHtml } from '../../core/html.js';
import type { SessionUser } from './types.js';

export function signupContent(values: { name: string; email: string }): SafeHtml {
  return html`<h1>Criar conta</h1>
<form method="post" action="/cadastro">
<label for="nome">Nome</label>
<input id="nome" name="nome" type="text" value="${values.name}" autocomplete="name">
<label for="email">E-mail</label>
<input id="email" name="email" type="text" inputmode="email" value="${values.email}" autocomplete="email">
<label for="senha">Senha</label>
<input id="senha" name="senha" type="password" autocomplete="new-password">
<button type="submit">Criar conta</button>
</form>
<p>Já tem conta? <a href="/entrar">Entrar</a></p>`;
}

export function loginContent(values: { email: string; voltar: string | null }): SafeHtml {
  const voltar = values.voltar === null ? '' : html`
<input type="hidden" name="voltar" value="${values.voltar}">`;
  return html`<h1>Entrar</h1>
<form method="post" action="/entrar">
<label for="email">E-mail</label>
<input id="email" name="email" type="text" inputmode="email" value="${values.email}" autocomplete="username">
<label for="senha">Senha</label>
<input id="senha" name="senha" type="password" autocomplete="current-password">${voltar}
<button type="submit">Entrar</button>
</form>
<p>Não tem conta? <a href="/cadastro">Criar conta</a></p>`;
}

/** Acesso negado: participante na área do organizador ou organizador em página de participante. */
export function forbiddenContent(area: 'organizador' | 'participante'): SafeHtml {
  const text =
    area === 'organizador' ? 'Esta área é exclusiva para organizadores.' : 'Esta página é exclusiva para participantes.';
  return html`<h1>Acesso negado</h1><p>${text}</p>`;
}

export function originBlockedContent(): SafeHtml {
  return html`<h1>Requisição bloqueada</h1><p>Origem da requisição não permitida.</p>`;
}

/** Trecho da navegação no topo: Entrar/Criar conta, ou nome + link da área + Sair. */
export function navContribution(user: SessionUser | null): SafeHtml {
  if (user === null) {
    return html`<span class="nav-conta"><a href="/entrar">Entrar</a> <a href="/cadastro">Criar conta</a></span>`;
  }
  const area =
    user.role === 'organizador'
      ? html`<a href="/organizador">Área do organizador</a>`
      : html`<a href="/meus-ingressos">Meus ingressos</a>`;
  return html`<span class="nav-conta"><span class="nav-usuario">${user.name}</span> ${area} <form method="post" action="/sair" style="display:inline"><button type="submit">Sair</button></form></span>`;
}
