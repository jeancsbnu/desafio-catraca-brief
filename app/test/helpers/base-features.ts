// Aplicação de teste só com os módulos de F01–F04 (sem o módulo ingressos, F05, e os seguintes).
//
// O módulo ingressos registra, no registro do plugin, o provedor de vagas ocupadas (F04) e o
// tratador do resultado do gateway (F03); cada um aceita um único registro por aplicação. Os
// testes que exercitam esses pontos de extensão isolados (registrando os próprios tratadores) usam
// esta aplicação: test/fixtures/features-base reexporta os módulos reais, menos o ingressos.
import { fileURLToPath } from 'node:url';
import { createTestApp, type TestApp, type TestAppOptions } from './app.js';

export const BASE_FEATURES_DIR = fileURLToPath(new URL('../fixtures/features-base/', import.meta.url));

export function createBaseTestApp(options: Omit<TestAppOptions, 'featuresDir'> = {}): Promise<TestApp> {
  return createTestApp({ ...options, featuresDir: BASE_FEATURES_DIR });
}
