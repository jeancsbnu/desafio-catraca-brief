import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/index.js';
import type { EnvSource } from '../../src/config.js';

async function cli(argv: string[], env: EnvSource = process.env) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env, stdout: (line) => out.push(line), stderr: (line) => err.push(line) });
  return { code, out, err };
}

describe('F01 linha de comando catraca', () => {
  it('F01-CA06 catraca config imprime GATEWAY_MODE=simulado e mascara segredos', async () => {
    const { code, out } = await cli(['config'], {
      NODE_ENV: 'production',
      TZ: 'America/Sao_Paulo',
      DATABASE_URL: 'postgres://catraca:catraca@db:5432/catraca',
    });
    expect(code).toBe(0);
    expect(out).toEqual([
      'NODE_ENV=production',
      'HOST=0.0.0.0',
      'PORT=3000',
      'TZ=America/Sao_Paulo',
      'DATABASE_URL=postgres://catraca:****@db:5432/catraca',
      'GATEWAY_MODE=simulado',
      'GATEWAY_DELAY_SCALE=1',
      'PARTNER_API_KEY=parceiro-catraca-dev',
      'SESSION_SECRET=****',
      'LOG_LEVEL=info',
    ]);
  });

  it('catraca help lista migrate, seed e config', async () => {
    for (const argv of [['help'], []]) {
      const { code, out } = await cli(argv);
      expect(code).toBe(0);
      expect(out[0]).toBe('Comandos disponíveis:');
      const names = out.slice(1).map((line) => line.trim().split(/\s+/)[0]);
      expect(names).toEqual(expect.arrayContaining(['migrate', 'seed', 'config', 'help']));
    }
  });

  it('comando desconhecido termina com código 2 e lista os comandos', async () => {
    const { code, out, err } = await cli(['nao-existe']);
    expect(code).toBe(2);
    expect(out).toEqual([]);
    expect(err[0]).toBe('Comando desconhecido: nao-existe');
    expect(err).toContain('Comandos disponíveis:');
  });

  it('F01-CA03 catraca migrate e catraca seed não duplicam nada', async () => {
    const migrate = await cli(['migrate']);
    expect(migrate.code).toBe(0);
    expect(migrate.out.at(-1)).toMatch(/^\[catraca\] migrations: aplicadas 0, já aplicadas [1-9]\d*$/);

    const first = await cli(['seed']);
    expect(first.code).toBe(0);
    expect(first.out).toEqual(['[catraca] seed: contas garantidas 3 (criadas 3, já existiam 0)']);
    const second = await cli(['seed']);
    expect(second.out).toEqual(['[catraca] seed: contas garantidas 3 (criadas 0, já existiam 3)']);
  });
});
