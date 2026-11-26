// Volta segura depois do login: o parâmetro "voltar" só aceita caminhos locais do produto.
import { hasControlChars } from './validation.js';

const BASE = 'http://catraca.invalid';
const MAX_LENGTH = 2048;
const ACCOUNT_PATHS = ['/entrar', '/cadastro', '/sair'];

function isAccountPath(path: string): boolean {
  return ACCOUNT_PATHS.some(
    (account) => path === account || path.startsWith(`${account}/`) || path.startsWith(`${account}?`),
  );
}

/** Caminho local "seguro" (pathname + query, sem fragmento) ou null. */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_LENGTH) return null;
  // Navegadores descartam tabulação e quebras de linha e tratam "\" como "/": "/\host" e
  // "/<TAB>/host" virariam "//host".
  if (hasControlChars(value) || value.includes('\\')) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;

  const path = `${url.pathname}${url.search}`;
  // A normalização da URL (ex.: "/.//host") não pode produzir um caminho relativo ao protocolo.
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  if (isAccountPath(path)) return null;
  return path;
}

/** "/entrar" ou "/entrar?voltar=<caminho codificado>" (voltar inválido é ignorado). */
export function loginPath(voltar?: string): string {
  const path = safeReturnPath(voltar);
  return path === null ? '/entrar' : `/entrar?voltar=${encodeURIComponent(path)}`;
}
