// CF08 (F04 → F06): a vitrine reflete o status do evento, mudado pela gestão da F04: rascunho não
// aparece, publicado aparece, cancelado sai (e a página do evento volta a responder 404).
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { seedAccounts } from '../helpers/seed.js';
import { loginAs } from '../helpers/session.js';
import { createViaHttp, postEmpty, postForm } from '../f04/support.js';
import { get, showcaseRow } from './support.js';

describe('F06 CF08 status do evento', () => {
  it('CF08 pela gestão da F04: rascunho não aparece, publicado aparece e cancelado sai da vitrine', async () => {
    const { app } = await createTestApp();
    await seedAccounts();
    const organizer = await loginAs(app, 'organizador.a@catraca.test');
    const id = await createViaHttp(app, organizer, { nome: 'Show CF08', lotacao: '3' });

    const draftShowcase = await get(app, '/');
    expect(showcaseRow(draftShowcase.body, id)).toBeNull();
    expect(draftShowcase.body).not.toContain('Show CF08');
    expect((await get(app, `/eventos/${id}`)).statusCode).toBe(404);

    expect((await postEmpty(app, `/organizador/eventos/${id}/publicar`, organizer)).statusCode).toBe(302);
    const publishedShowcase = await get(app, '/');
    expect(showcaseRow(publishedShowcase.body, id)).toContain('>Show CF08</a>');
    expect(showcaseRow(publishedShowcase.body, id)).toContain('<td>3</td>');
    const page = await get(app, `/eventos/${id}`);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<h1>Show CF08</h1>');

    const cancel = await postForm(app, `/organizador/eventos/${id}/cancelar`, { confirmar: 'sim' }, organizer);
    expect(cancel.statusCode).toBe(302);
    const cancelledShowcase = await get(app, '/');
    expect(showcaseRow(cancelledShowcase.body, id)).toBeNull();
    expect(cancelledShowcase.body).not.toContain('Show CF08');
    const gone = await get(app, `/eventos/${id}`);
    expect(gone.statusCode).toBe(404);
    expect(gone.body).toBe((await get(app, '/eventos/evt_0000000000000000')).body);
  });
});
