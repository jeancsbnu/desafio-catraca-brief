import { describe, expect, it } from 'vitest';
import { loginPath, safeReturnPath } from '../../src/features/contas/return-path.js';

describe('F02 volta segura depois do login', () => {
  it('aceita caminho local com query e descarta o fragmento', () => {
    expect(safeReturnPath('/meus-ingressos')).toBe('/meus-ingressos');
    expect(safeReturnPath('/eventos/evt_ab12?x=1')).toBe('/eventos/evt_ab12?x=1');
    expect(safeReturnPath('/eventos/evt_ab12?x=1#y')).toBe('/eventos/evt_ab12?x=1');
    expect(safeReturnPath('/')).toBe('/');
  });

  it('rejeita URL absoluta, //host, /\\host, controle, javascript: e http:/host', () => {
    const maliciosos = [
      'https://evil.example/',
      '//evil.example/x',
      '/\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      '/x\u0000',
      '/x\u007F',
      'javascript:alert(1)',
      'http:/evil.example',
      'evil',
      'evil.example/x',
      // A normalização de "." e ".." não pode produzir "//host".
      '/.//evil.example/x',
      '/..//evil.example/x',
    ];
    for (const valor of maliciosos) {
      expect(safeReturnPath(valor), JSON.stringify(valor)).toBeNull();
    }
  });

  it('rejeita /entrar, /cadastro e /sair como destino', () => {
    for (const valor of ['/entrar', '/entrar?voltar=/x', '/entrar/', '/cadastro', '/sair', '/./entrar']) {
      expect(safeReturnPath(valor), valor).toBeNull();
    }
    expect(safeReturnPath('/entrarx')).toBe('/entrarx');
  });

  it('rejeita vazio, não texto e mais de 2048 caracteres', () => {
    expect(safeReturnPath('')).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(['/a', '/b'])).toBeNull();
    expect(safeReturnPath(42)).toBeNull();
    expect(safeReturnPath(`/${'a'.repeat(2047)}`)).toBe(`/${'a'.repeat(2047)}`);
    expect(safeReturnPath(`/${'a'.repeat(2048)}`)).toBeNull();
  });

  it('loginPath codifica o voltar e ignora voltar inválido', () => {
    expect(loginPath('/meus-ingressos')).toBe('/entrar?voltar=%2Fmeus-ingressos');
    expect(loginPath('/eventos/evt_ab12')).toBe('/entrar?voltar=%2Feventos%2Fevt_ab12');
    expect(loginPath('/eventos/evt_ab12?x=1&y=2')).toBe('/entrar?voltar=%2Feventos%2Fevt_ab12%3Fx%3D1%26y%3D2');
    expect(loginPath('https://evil.example/')).toBe('/entrar');
    expect(loginPath()).toBe('/entrar');
  });
});
