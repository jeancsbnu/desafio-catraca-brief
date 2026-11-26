// Executado em cada arquivo de teste: banco limpo antes de cada teste, apps fechadas depois.
import { afterAll, afterEach, beforeEach } from 'vitest';
import { closeTestApps } from './helpers/app.js';
import { closeTestDb, resetDatabase } from './helpers/db.js';

beforeEach(async () => {
  await resetDatabase();
});

afterEach(async () => {
  await closeTestApps();
});

afterAll(async () => {
  await closeTestDb();
});
