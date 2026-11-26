// Carga do módulo ingressos e seus registros nos pontos de extensão de F03 e F04 (spec 4, 5.12).
import { describe, expect, it } from 'vitest';
import { ErroGateway } from '../../src/features/gateway/public.js';
import { findTicketById } from '../../src/features/ingressos/public.js';
import { createTestApp } from '../helpers/app.js';
import { insertTestEvent } from '../helpers/events.js';
import { entregarVencidas, vencerTentativas } from '../helpers/gateway.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { eventFields, postForm } from '../f04/support.js';

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

  it('registra o provedor de vagas, o tratador de cancelamento e o tratador do gateway', async () => {
    const { app, db } = await createTestApp();
    // Um único provedor e um único tratador do gateway por aplicação: os da F05 já estão lá.
    expect(() => app.events.setOccupiedSeatsProvider(async () => 0)).toThrow(/já registrado/);
    expect(() => app.gateway.aoReceberResultado(async () => {})).toThrow(ErroGateway);

    const accounts = await seedAccounts();
    const cookieA = await loginAs(app, 'organizador.a@catraca.test');
    const event = await insertTestEvent(db, { organizerId: accounts.organizadorA.id, capacity: 2 });
    const buy = async (cardNumber: string) => {
      const result = await app.tickets.purchase({
        eventId: event.id,
        buyer: { type: 'email', email: 'ana@example.com' },
        cardNumber,
        channel: 'api',
      });
      if (!result.ok) throw new Error(result.reason);
      return result.ticket;
    };
    const approved = await buy('4000000000000001');
    const pending = await buy('4000000000000003');

    // Provedor de vagas: a edição para 1 é recusada (2 ocupadas).
    const edit = await postForm(
      app,
      `/organizador/eventos/${event.id}/editar`,
      { ...eventFields({ nome: event.name, local: event.location, lotacao: '1', preco: '100,00' }) },
      cookieA,
    );
    expect(edit.statusCode).toBe(422);

    // Tratador do gateway: entregarVencidas aplica o resultado da compra.
    await vencerTentativas(db, { referencias: [approved.id] });
    expect(await entregarVencidas(app)).toEqual({ entregues: 1, falhas: 0 });
    expect((await findTicketById(db, approved.id))?.status).toBe('confirmed');

    // Tratador de cancelamento: confirmed → refunded, pending → cancelled.
    const cancel = await postForm(app, `/organizador/eventos/${event.id}/cancelar`, { confirmar: 'sim' }, cookieA);
    expect(cancel.statusCode).toBe(302);
    expect((await findTicketById(db, approved.id))?.status).toBe('refunded');
    expect((await findTicketById(db, pending.id))?.status).toBe('cancelled');
  });
});
