// Seção "Painel" na página de gestão (spec 5.1, 5.2 e 5.6): registro, presença, posição e a falha
// isolada do cálculo.
import { describe, expect, it, vi } from 'vitest';
import { html } from '../../src/core/html.js';
import type { EventStatus } from '../../src/features/eventos/public.js';
import { createPanelSection } from '../../src/features/painel/section.js';
import { PANEL_SECTION_NAME, PANEL_SECTION_ORDER } from '../../src/features/painel/types.js';
import { createTestApp } from '../helpers/app.js';
import { insertTestEvent } from '../helpers/events.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { insertTestTicket } from '../helpers/tickets.js';
import { createViaHttp } from '../f04/support.js';
import { occurrences, panelLine, panelOf, setup } from './support.js';

describe('F09 seção Painel', () => {
  it('F09-CA01 o painel aparece uma vez na página de gestão, depois dos dados do evento e do check-in e antes do link de volta, em rascunho, publicado e cancelado', async () => {
    const { app, db, accounts, cookieA } = await setup();
    const expected: Record<EventStatus, string> = {
      rascunho: panelLine(0, 0, 0, 4, 'R$ 0,00', 0),
      publicado: panelLine(0, 0, 0, 4, 'R$ 0,00', 0),
      cancelado: panelLine(0, 0, 0, 0, 'R$ 0,00', 0),
    };
    for (const status of ['rascunho', 'publicado', 'cancelado'] as EventStatus[]) {
      const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, status, capacity: 4 });
      const page = await panelOf(app, cookieA, event.id);
      expect(page.statusCode, status).toBe(200);
      expect(page.sections, status).toBe(1);
      expect(occurrences(page.body, 'data-secao="painel"'), status).toBe(1);
      expect(occurrences(page.body, 'data-metrica='), status).toBe(6);
      expect(page.html, status).toContain('<h2>Painel</h2>');
      expect(page.labels, status).toEqual(['Confirmados', 'Pendentes', 'Check-ins', 'Vagas disponíveis', 'Receita', 'Estornados']);
      expect(Object.keys(page.metrics), status).toEqual([
        'confirmados',
        'pendentes',
        'check-ins',
        'vagas-disponiveis',
        'receita',
        'estornados',
      ]);
      expect(page.line, status).toBe(expected[status]);
      expect(page.revenueCents, status).toBe(0);
      const data = page.body.indexOf('<dt>Preço</dt>');
      const checkin = page.body.indexOf('data-secao="checkin"');
      const painel = page.body.indexOf('data-secao="painel"');
      const back = page.body.lastIndexOf('Voltar para meus eventos');
      expect(data, status).toBeGreaterThanOrEqual(0);
      expect(data < checkin && checkin < painel && painel < back, status).toBe(true);
    }
  });

  it('F09-CA01 evento sem ingressos mostra zeros, Vagas = lotação e Receita R$ 0,00', async () => {
    const { app, cookieA } = await setup();
    const eventId = await createViaHttp(app, cookieA, { lotacao: '4', preco: '25,00' });
    const page = await panelOf(app, cookieA, eventId);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<strong data-status="rascunho">Rascunho</strong>');
    expect(page.line).toBe(panelLine(0, 0, 0, 4, 'R$ 0,00', 0));
    expect(page.body).toContain(
      [
        '<section class="gestao-secao" data-secao="painel"><h2>Painel</h2>',
        '<dl>',
        '<dt>Confirmados</dt><dd data-metrica="confirmados">0</dd>',
        '<dt>Pendentes</dt><dd data-metrica="pendentes">0</dd>',
        '<dt>Check-ins</dt><dd data-metrica="check-ins">0</dd>',
        '<dt>Vagas disponíveis</dt><dd data-metrica="vagas-disponiveis">4</dd>',
        '<dt>Receita</dt><dd data-metrica="receita" data-centavos="0">R$ 0,00</dd>',
        '<dt>Estornados</dt><dd data-metrica="estornados">0</dd>',
        '</dl>',
        '<p>Números do momento em que a página foi aberta. Recarregue para atualizar.</p></section>',
      ].join('\n'),
    );
  });

  it('o módulo painel carrega depois de eventos e ingressos e registra a seção painel com ordem 200', async () => {
    const { app, db } = await createTestApp();
    const modules = app.featureModules;
    expect(modules).toContain('painel');
    expect(modules.indexOf('eventos')).toBeLessThan(modules.indexOf('ingressos'));
    expect(modules.indexOf('ingressos')).toBeLessThan(modules.indexOf('painel'));
    expect(modules.indexOf('checkin')).toBeLessThan(modules.indexOf('painel'));
    expect(app.hasPlugin('painel')).toBe(true);
    const mod = (await import('../../src/features/painel/index.js')) as { loadOrder?: number };
    expect(mod.loadOrder).toBe(60);
    expect(PANEL_SECTION_NAME).toBe('painel');
    expect(PANEL_SECTION_ORDER).toBe(200);
    const section = createPanelSection();
    expect(section.name).toBe('painel');
    expect(section.order).toBe(200);
    // A seção já está registrada: um segundo registro com o mesmo nome é recusado pela F04.
    expect(() => app.events.addManagementSection({ name: 'painel', order: 1, render: () => html`` })).toThrow(
      /seção repetida/,
    );
    // Seções de teste em volta da ordem 200: o painel fica entre elas e depois do check-in (100).
    app.events.addManagementSection({ name: 'teste-150', order: 150, render: () => html`<p>seção 150</p>` });
    app.events.addManagementSection({ name: 'teste-250', order: 250, render: () => html`<p>seção 250</p>` });
    const accounts = await seedAccounts();
    const cookieA = await loginAs(app, 'organizador.a@catraca.test');
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id });
    const page = await panelOf(app, cookieA, event.id);
    expect(page.statusCode).toBe(200);
    const checkin = page.body.indexOf('data-secao="checkin"');
    const before = page.body.indexOf('data-secao="teste-150"');
    const painel = page.body.indexOf('data-secao="painel"');
    const after = page.body.indexOf('data-secao="teste-250"');
    expect(checkin).toBeGreaterThanOrEqual(0);
    expect(checkin < before && before < painel && painel < after).toBe(true);
  });

  it('falha ao calcular mostra Painel indisponível, registra o erro e mantém o resto da página', async () => {
    const { app, db } = await createTestApp();
    const failing = createPanelSection({ load: () => Promise.reject(new Error('x')) });
    app.events.addManagementSection({ ...failing, name: 'painel-teste', order: 300 });
    const errors: { data: unknown; msg: unknown }[] = [];
    app.addHook('onRequest', async (request) => {
      vi.spyOn(request.log, 'error').mockImplementation((data: unknown, msg: unknown) => {
        errors.push({ data, msg });
      });
    });
    const accounts = await seedAccounts();
    const cookieA = await loginAs(app, 'organizador.a@catraca.test');
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 3 });
    await insertTestTicket(db, { eventId: event.id, status: 'confirmed', pricePaidCents: 4200 });

    const page = await panelOf(app, cookieA, event.id);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain(
      '<section class="gestao-secao" data-secao="painel-teste"><h2>Painel</h2>\n<p>Painel indisponível no momento. Recarregue a página.</p></section>',
    );
    // O formulário de check-in (F08) e o painel real continuam na página.
    expect(page.body).toContain(`<form method="post" action="/organizador/eventos/${event.id}/checkin">`);
    expect(page.line).toBe(panelLine(1, 0, 0, 2, 'R$ 42,00', 0));
    expect(occurrences(page.body, 'data-metrica=')).toBe(6);
    const failed = page.body.slice(page.body.indexOf('data-secao="painel-teste"'));
    expect(failed.slice(0, failed.indexOf('</section>'))).not.toContain('data-metrica');

    const logged = errors.filter((entry) => entry.msg === 'painel: falha ao calcular o painel');
    expect(logged).toHaveLength(1);
    const data = logged[0]?.data as { eventId?: unknown; err?: unknown };
    expect(data.eventId).toBe(event.id);
    expect(data.err).toBeInstanceOf(Error);
    expect((data.err as Error).message).toBe('x');
  });
});
