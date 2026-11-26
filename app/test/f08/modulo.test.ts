// Carga do módulo checkin e o registro da seção no ponto de extensão da F04 (spec 4, 5.5).
import { describe, expect, it } from 'vitest';
import { html } from '../../src/core/html.js';
import { CHECKIN_SECTION_NAME, CHECKIN_SECTION_ORDER, checkInPath } from '../../src/features/checkin/public.js';
import { createTestApp } from '../helpers/app.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { get } from '../f04/support.js';

describe('F08 módulo checkin', () => {
  it('o módulo carrega depois de eventos e ingressos', async () => {
    const { app } = await createTestApp();
    const modules = app.featureModules;
    expect(modules).toContain('checkin');
    expect(modules.indexOf('eventos')).toBeLessThan(modules.indexOf('ingressos'));
    expect(modules.indexOf('ingressos')).toBeLessThan(modules.indexOf('checkin'));
    expect(app.hasPlugin('checkin')).toBe(true);
    const mod = (await import('../../src/features/checkin/index.js')) as { loadOrder?: number };
    expect(mod.loadOrder).toBe(50);
    expect(CHECKIN_SECTION_NAME).toBe('checkin');
    expect(CHECKIN_SECTION_ORDER).toBe(100);
    expect(checkInPath('evt_aaaaaaaaaaaaaaaa')).toBe('/organizador/eventos/evt_aaaaaaaaaaaaaaaa/checkin');
    // A seção já está registrada: um segundo registro com o mesmo nome é recusado pela F04.
    expect(() =>
      app.events.addManagementSection({ name: 'checkin', order: 1, render: () => html`` }),
    ).toThrow(/seção repetida/);
  });

  it('F08-CA01 a seção checkin é registrada com ordem 100', async () => {
    const { app, db } = await createTestApp();
    // Seções de teste antes e depois da ordem 100 (como a do painel da F09, ordem 200).
    app.events.addManagementSection({ name: 'teste-200', order: 200, render: () => html`<p>seção 200</p>` });
    app.events.addManagementSection({ name: 'teste-99', order: 99, render: () => html`<p>seção 99</p>` });
    const accounts = await seedAccounts();
    const cookieA = await loginAs(app, 'organizador.a@catraca.test');
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const response = await get(app, `/organizador/eventos/${event.id}`, cookieA);
    expect(response.statusCode).toBe(200);
    const before = response.body.indexOf('data-secao="teste-99"');
    const checkin = response.body.indexOf('data-secao="checkin"');
    const after = response.body.indexOf('data-secao="teste-200"');
    expect(before).toBeGreaterThanOrEqual(0);
    expect(before < checkin && checkin < after).toBe(true);
  });
});
