// Carga do módulo ingressos e seus registros nos pontos de extensão de F03 e F04 (spec 4, 5.12).
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';

describe('F05 módulo ingressos', () => {
  it('o módulo carrega com loadOrder 40 depois de eventos e gateway e decora app.tickets', async () => {
    const { app } = await createTestApp();
    const modules = app.featureModules;
    expect(modules).toContain('ingressos');
    expect(modules.indexOf('ingressos')).toBe(modules.indexOf('eventos') + 1);
    expect(modules.indexOf('gateway')).toBeLessThan(modules.indexOf('ingressos'));
    expect(typeof app.tickets.purchase).toBe('function');
    expect(app.hasPlugin('ingressos')).toBe(true);
    const mod = (await import('../../src/features/ingressos/index.js')) as { loadOrder?: number };
    expect(mod.loadOrder).toBe(40);
  });
});
