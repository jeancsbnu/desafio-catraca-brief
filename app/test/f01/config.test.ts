import { describe, expect, it } from 'vitest';
import { ConfigError, describeConfig, loadConfig } from '../../src/config.js';

describe('F01 configuração', () => {
  it('F01-CA06 sem variáveis de ambiente usa gateway simulado, escala 1 e chave de parceiro padrão', () => {
    const config = loadConfig({});
    expect(config.gateway.mode).toBe('simulado');
    expect(config.gateway.delayScale).toBe(1);
    expect(config.partnerApiKey).toBe('parceiro-catraca-dev');
    expect(config.nodeEnv).toBe('development');
    expect(config.logLevel).toBe('info');
    expect(config.sessionSecret.length).toBeGreaterThanOrEqual(32);
    expect(config.warnings).toEqual([]);
  });

  it('usa PORT 3000, HOST 0.0.0.0 e DATABASE_URL do Compose por padrão', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.databaseUrl).toBe('postgres://catraca:catraca@db:5432/catraca');
  });

  it('rejeita GATEWAY_MODE diferente de simulado', () => {
    expect(() => loadConfig({ GATEWAY_MODE: 'real' })).toThrow(ConfigError);
    expect(() => loadConfig({ GATEWAY_MODE: 'real' })).toThrow('GATEWAY_MODE inválido: real. Valor aceito: simulado');
  });

  it('ignora GATEWAY_DELAY_SCALE fora de NODE_ENV=test e aceita com NODE_ENV=test', () => {
    const production = loadConfig({ NODE_ENV: 'production', GATEWAY_DELAY_SCALE: '0.01' });
    expect(production.gateway.delayScale).toBe(1);
    expect(production.warnings.join('\n')).toContain('GATEWAY_DELAY_SCALE ignorada');
    const development = loadConfig({ GATEWAY_DELAY_SCALE: '0.01' });
    expect(development.gateway.delayScale).toBe(1);
    const test = loadConfig({ NODE_ENV: 'test', GATEWAY_DELAY_SCALE: '0.01' });
    expect(test.gateway.delayScale).toBe(0.01);
    expect(test.warnings).toEqual([]);
  });

  it('rejeita GATEWAY_DELAY_SCALE não positiva no ambiente de testes', () => {
    for (const value of ['0', '-1', 'abc']) {
      expect(() => loadConfig({ NODE_ENV: 'test', GATEWAY_DELAY_SCALE: value })).toThrow(ConfigError);
    }
  });

  it('rejeita PORT fora de 1-65535 e SESSION_SECRET com menos de 32 caracteres', () => {
    for (const value of ['0', '65536', 'abc', '3000.5', '-1']) {
      expect(() => loadConfig({ PORT: value })).toThrow(ConfigError);
    }
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
    expect(() => loadConfig({ SESSION_SECRET: 'curto' })).toThrow(ConfigError);
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(ConfigError);
    expect(() => loadConfig({ LOG_LEVEL: 'verbose' })).toThrow(ConfigError);
    expect(() => loadConfig({ DATABASE_URL: 'mysql://x@y/z' })).toThrow(ConfigError);
  });

  it('describeConfig mascara a senha do banco e o SESSION_SECRET', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://catraca:segredo@db:5432/catraca',
      SESSION_SECRET: 'um-segredo-de-sessao-bem-comprido-123456',
    });
    const lines = describeConfig(config, { TZ: 'America/Sao_Paulo' });
    expect(lines).toEqual([
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
    expect(lines.join('\n')).not.toContain('segredo');
    expect(describeConfig(config, {})).toContain('TZ=(não definido)');
  });
});
