// Carga do módulo parceiros, cabeçalhos comuns e ausência de sessão na API (spec 4, 5.1, 5.7).
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';

describe('F07 módulo parceiros', () => {
  it('o módulo parceiros carrega depois de eventos e ingressos', async () => {
    const { app } = await createTestApp();
    const modules = app.featureModules;
    expect(modules).toContain('parceiros');
    expect(modules.indexOf('parceiros')).toBeGreaterThan(modules.indexOf('eventos'));
    expect(modules.indexOf('parceiros')).toBeGreaterThan(modules.indexOf('ingressos'));
    expect(app.hasPlugin('parceiros')).toBe(true);
    const mod = (await import('../../src/features/parceiros/index.js')) as { loadOrder?: number };
    expect(mod.loadOrder).toBeUndefined();
  });

  it('a API não lê nem grava sessão', async () => {
    const { app } = await createTestApp();
    const cookie = 'catraca_sessao=valor-invalido.assinatura-invalida';
    for (const headers of [{ cookie }, { cookie, 'x-api-key': app.config.partnerApiKey }]) {
      const response = await app.inject({ method: 'GET', url: '/api/partner/nada', headers });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });
});
