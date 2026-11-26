import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: 'test/global-setup.ts',
    setupFiles: ['test/setup.ts'],
    // Arquivos em sequência sobre um único banco de teste, limpo entre testes.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
