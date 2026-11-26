import { describe, expect, it } from 'vitest';
import { runSeed } from '../../src/db/seed.js';
import { testDb } from '../helpers/db.js';

describe('F04 seed', () => {
  it('a seed não cria eventos (pendência da F01)', async () => {
    await runSeed(testDb());
    await runSeed(testDb());
    const { rows } = await testDb().query<{ events: number; users: number }>(
      'SELECT (SELECT count(*) FROM events) AS events, (SELECT count(*) FROM users) AS users',
    );
    expect(rows).toEqual([{ events: 0, users: 3 }]);
  });
});
