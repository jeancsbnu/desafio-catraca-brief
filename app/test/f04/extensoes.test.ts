import { describe, expect, it } from 'vitest';
import { html } from '../../src/core/html.js';
import { withTransaction } from '../../src/db/transaction.js';
import { createTestApp } from '../helpers/app.js';

const LATE = 'eventos: registro de extensão depois de a aplicação ficar pronta';
const render = (): ReturnType<typeof html> => html`<p>x</p>`;

describe('F04 pontos de extensão: registros', () => {
  it('nome de seção repetido, reservado ou inválido lança erro', async () => {
    const { app } = await createTestApp();
    app.events.addManagementSection({ name: 'checkin', order: 100, render });
    expect(() => app.events.addManagementSection({ name: 'checkin', order: 1, render })).toThrow(/seção repetida/);
    expect(() => app.events.addManagementSection({ name: 'edicao', order: 1, render })).toThrow(/reservado/);
    for (const name of ['Check In', 'check in', '1painel', '', '-x', 'painel_x']) {
      expect(() => app.events.addManagementSection({ name, order: 1, render }), name).toThrow(/nome de seção inválido/);
    }
    expect(() => app.events.addManagementSection({ name: 'painel', order: Number.NaN, render })).toThrow(/order/);
    app.events.addManagementSection({ name: 'painel-2', order: 200, render });
  });

  it('segundo provedor de vagas lança erro', async () => {
    const { app } = await createTestApp();
    app.events.setOccupiedSeatsProvider(async () => 0);
    expect(() => app.events.setOccupiedSeatsProvider(async () => 1)).toThrow(/já registrado/);
  });

  it('registro depois de a aplicação ficar pronta lança erro', async () => {
    const { app } = await createTestApp();
    await app.ready();
    expect(() => app.events.addManagementSection({ name: 'tarde', order: 1, render })).toThrow(LATE);
    expect(() => app.events.setOccupiedSeatsProvider(async () => 0)).toThrow(LATE);
    expect(() => app.events.onEventCancelled(async () => {})).toThrow(LATE);
  });

  it('vagas ocupadas: zero sem provedor; valor do provedor; valor inválido é erro de programação', async () => {
    const semProvedor = await createTestApp();
    await withTransaction(semProvedor.db, async (client) => {
      expect(await semProvedor.app.events.occupiedSeats(client, 'evt_0000000000000000')).toBe(0);
    });

    const comProvedor = await createTestApp();
    const chamadas: string[] = [];
    let valor: unknown = 3;
    comProvedor.app.events.setOccupiedSeatsProvider(async (_client, eventId) => {
      chamadas.push(eventId);
      return valor as number;
    });
    await withTransaction(comProvedor.db, async (client) => {
      expect(await comProvedor.app.events.occupiedSeats(client, 'evt_0000000000000001')).toBe(3);
      for (const invalido of [-1, 1.5, Number.NaN, '2', null]) {
        valor = invalido;
        await expect(comProvedor.app.events.occupiedSeats(client, 'evt_0000000000000001')).rejects.toThrow(
          /valor inválido/,
        );
      }
    });
    expect(chamadas[0]).toBe('evt_0000000000000001');
  });
});
