import { describe, expect, it } from 'vitest';
import { newId } from '../../src/core/ids.js';
import { verifyPassword } from '../../src/core/password.js';
import { runSeed, SEED_PASSWORD } from '../../src/db/seed.js';
import { testDb } from '../helpers/db.js';
import { seedAccounts } from '../helpers/seed.js';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  password_hash: string;
}

async function users(): Promise<UserRow[]> {
  const { rows } = await testDb().query<UserRow>(
    'SELECT id, name, email, role, password_hash FROM users ORDER BY email',
  );
  return rows;
}

describe('F01 seed', () => {
  it('F01-CA01 cria exatamente as 3 contas da seed com nome, e-mail e papel', async () => {
    const report = await runSeed(testDb());
    expect(report).toEqual({ created: 3, existing: 0 });
    const rows = await users();
    expect(rows.map(({ name, email, role }) => ({ name, email, role }))).toEqual([
      { name: 'Organizador A', email: 'organizador.a@catraca.test', role: 'organizador' },
      { name: 'Organizador B', email: 'organizador.b@catraca.test', role: 'organizador' },
      { name: 'Participante', email: 'participante@catraca.test', role: 'participante' },
    ]);
    for (const row of rows) expect(row.id).toMatch(/^usr_[a-z0-9]{16}$/);
  });

  it('F01-CA03 rodar a seed de novo não duplica contas e preserva os ids', async () => {
    await runSeed(testDb());
    const before = await users();
    const report = await runSeed(testDb());
    expect(report).toEqual({ created: 0, existing: 3 });
    const after = await users();
    expect(after).toHaveLength(3);
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
  });

  it('F01-CA03 seed restaura nome, papel e senha documentada de uma conta alterada', async () => {
    const { organizadorA } = await seedAccounts();
    await testDb().query(
      "UPDATE users SET name = 'Outro Nome', role = 'participante', password_hash = 'scrypt$x' WHERE id = $1",
      [organizadorA.id],
    );
    expect(await runSeed(testDb())).toEqual({ created: 0, existing: 3 });
    const { rows } = await testDb().query<UserRow>('SELECT * FROM users WHERE id = $1', [organizadorA.id]);
    const row = rows[0];
    expect(row?.name).toBe('Organizador A');
    expect(row?.role).toBe('organizador');
    expect(await verifyPassword(SEED_PASSWORD, row?.password_hash ?? '')).toBe(true);
  });

  it('senhas da seed são hash scrypt e nunca o texto da senha', async () => {
    await runSeed(testDb());
    for (const row of await users()) {
      expect(row.password_hash.startsWith('scrypt$')).toBe(true);
      expect(row.password_hash).not.toContain('catraca123');
      expect(await verifyPassword('catraca123', row.password_hash)).toBe(true);
    }
  });

  it('e-mail é único sem diferenciar maiúsculas', async () => {
    await runSeed(testDb());
    await expect(
      testDb().query("INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, 'X', $2, 'h', 'participante')", [
        newId('usr'),
        'ORGANIZADOR.A@catraca.test',
      ]),
    ).rejects.toThrow(/users_email_lower_key/);
  });

  it('seedAccounts devolve as 3 contas com id, e-mail, nome e papel', async () => {
    const accounts = await seedAccounts();
    expect(accounts.organizadorA).toMatchObject({ email: 'organizador.a@catraca.test', role: 'organizador' });
    expect(accounts.organizadorB).toMatchObject({ email: 'organizador.b@catraca.test', name: 'Organizador B' });
    expect(accounts.participante).toMatchObject({ email: 'participante@catraca.test', role: 'participante' });
    expect(accounts.participante.id).toMatch(/^usr_/);
  });
});
