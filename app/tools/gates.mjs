// Executor dos gates dentro do container: roda lint, typecheck e testes (sempre os três),
// imprime o resumo e sai com 0 só se tudo passou e ao menos 1 teste foi executado.
// Uso: node tools/gates.mjs [filtros do Vitest]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = (name) => join(appDir, 'node_modules', '.bin', name);
const filters = process.argv.slice(2);

function step(title, command, args) {
  process.stdout.write(`\n=== gates: ${title} ===\n`);
  const result = spawnSync(command, args, { cwd: appDir, stdio: 'inherit', env: process.env });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

function readVitestReport(path) {
  if (!existsSync(path)) return undefined;
  try {
    const report = JSON.parse(readFileSync(path, 'utf8'));
    const passed = Number(report.numPassedTests) || 0;
    const failed = Number(report.numFailedTests) || 0;
    return { passed, failed };
  } catch {
    return undefined;
  }
}

const lintCode = step('lint (eslint .)', bin('eslint'), ['.']);
const typecheckCode = step('typecheck (tsc --noEmit)', bin('tsc'), ['-p', 'tsconfig.json', '--noEmit']);

const reportDir = mkdtempSync(join(tmpdir(), 'catraca-gates-'));
const reportFile = join(reportDir, 'vitest.json');
const testCode = step(`testes (vitest run${filters.length > 0 ? ` ${filters.join(' ')}` : ''})`, bin('vitest'), [
  'run',
  '--reporter=default',
  '--reporter=json',
  `--outputFile.json=${reportFile}`,
  ...filters,
]);
const report = readVitestReport(reportFile);
rmSync(reportDir, { recursive: true, force: true });

const executed = report ? report.passed + report.failed : 0;
const failed = report ? report.failed : 0;
const lintOk = lintCode === 0;
const typecheckOk = typecheckCode === 0;
const testsOk = testCode === 0 && executed > 0 && failed === 0;

let testsLine;
if (executed === 0) {
  testsLine = 'testes: falhou (nenhum teste executado)';
} else if (testsOk) {
  testsLine = `testes: ok (${executed} executados, 0 falharam)`;
} else {
  testsLine = `testes: falhou (${executed} executados, ${failed} falharam)`;
}
if (filters.length > 0) {
  testsLine += ` [filtro: ${filters.join(' ')}]`;
}

const ok = lintOk && typecheckOk && testsOk;
process.stdout.write(
  [
    '',
    `[gates] lint: ${lintOk ? 'ok' : 'falhou'}`,
    `[gates] typecheck: ${typecheckOk ? 'ok' : 'falhou'}`,
    `[gates] ${testsLine}`,
    `[gates] resultado: ${ok ? 'OK' : 'FALHOU'}`,
    '',
  ].join('\n'),
);
process.exitCode = ok ? 0 : 1;
