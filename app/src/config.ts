// Configuração da aplicação por variáveis de ambiente, com padrões (nenhuma é obrigatória).

export type NodeEnv = 'production' | 'development' | 'test';
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
export type GatewayMode = 'simulado';

export interface AppConfig {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  gateway: {
    mode: GatewayMode;
    /** Escala dos atrasos do gateway. Só difere de 1 com NODE_ENV=test. */
    delayScale: number;
  };
  partnerApiKey: string;
  logLevel: LogLevel;
  /** Avisos gerados ao ler a configuração (ex.: variável ignorada). */
  warnings: string[];
}

export type EnvSource = Readonly<Record<string, string | undefined>>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export const CONFIG_DEFAULTS = {
  nodeEnv: 'development',
  host: '0.0.0.0',
  port: 3000,
  databaseUrl: 'postgres://catraca:catraca@db:5432/catraca',
  sessionSecret: 'catraca-dev-session-secret-nao-usar-em-producao',
  gatewayMode: 'simulado',
  gatewayDelayScale: 1,
  partnerApiKey: 'parceiro-catraca-dev',
  logLevel: 'info',
} as const;

const NODE_ENVS: readonly NodeEnv[] = ['production', 'development', 'test'];
const LOG_LEVELS: readonly LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
const GATEWAY_MODES: readonly GatewayMode[] = ['simulado'];
const MIN_SESSION_SECRET_LENGTH = 32;

/** Valor da variável sem espaços nas pontas; vazio conta como não definido. */
function read(env: EnvSource, key: string): string | undefined {
  const value = env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

export function loadConfig(env: EnvSource): AppConfig {
  const warnings: string[] = [];

  const nodeEnvRaw = read(env, 'NODE_ENV') ?? CONFIG_DEFAULTS.nodeEnv;
  if (!oneOf(nodeEnvRaw, NODE_ENVS)) {
    throw new ConfigError(`NODE_ENV inválido: ${nodeEnvRaw}. Valores aceitos: ${NODE_ENVS.join(', ')}`);
  }
  const nodeEnv = nodeEnvRaw;

  const host = read(env, 'HOST') ?? CONFIG_DEFAULTS.host;

  const portRaw = read(env, 'PORT');
  let port: number = CONFIG_DEFAULTS.port;
  if (portRaw !== undefined) {
    const parsed = /^\d+$/.test(portRaw) ? Number(portRaw) : Number.NaN;
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new ConfigError(`PORT inválida: ${portRaw}. Use um inteiro entre 1 e 65535`);
    }
    port = parsed;
  }

  const databaseUrl = read(env, 'DATABASE_URL') ?? CONFIG_DEFAULTS.databaseUrl;
  if (!/^postgres(ql)?:\/\/\S+$/.test(databaseUrl)) {
    throw new ConfigError('DATABASE_URL inválida: use uma URL postgres:// ou postgresql://');
  }

  const sessionSecret = read(env, 'SESSION_SECRET') ?? CONFIG_DEFAULTS.sessionSecret;
  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new ConfigError(
      `SESSION_SECRET muito curto: use pelo menos ${MIN_SESSION_SECRET_LENGTH} caracteres`,
    );
  }

  const gatewayModeRaw = read(env, 'GATEWAY_MODE') ?? CONFIG_DEFAULTS.gatewayMode;
  if (!oneOf(gatewayModeRaw, GATEWAY_MODES)) {
    throw new ConfigError(`GATEWAY_MODE inválido: ${gatewayModeRaw}. Valor aceito: simulado`);
  }

  const delayScaleRaw = read(env, 'GATEWAY_DELAY_SCALE');
  let delayScale: number = CONFIG_DEFAULTS.gatewayDelayScale;
  if (delayScaleRaw !== undefined) {
    if (nodeEnv === 'test') {
      const parsed = Number(delayScaleRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new ConfigError(`GATEWAY_DELAY_SCALE inválida: ${delayScaleRaw}. Use um número maior que 0`);
      }
      delayScale = parsed;
    } else {
      warnings.push(
        `aviso: GATEWAY_DELAY_SCALE ignorada fora do ambiente de testes (NODE_ENV=${nodeEnv}); vale 1`,
      );
    }
  }

  const partnerApiKey = read(env, 'PARTNER_API_KEY') ?? CONFIG_DEFAULTS.partnerApiKey;

  const logLevelRaw = read(env, 'LOG_LEVEL') ?? CONFIG_DEFAULTS.logLevel;
  if (!oneOf(logLevelRaw, LOG_LEVELS)) {
    throw new ConfigError(`LOG_LEVEL inválido: ${logLevelRaw}. Valores aceitos: ${LOG_LEVELS.join(', ')}`);
  }

  return {
    nodeEnv,
    host,
    port,
    databaseUrl,
    sessionSecret,
    gateway: { mode: gatewayModeRaw, delayScale },
    partnerApiKey,
    logLevel: logLevelRaw,
    warnings,
  };
}

/** Troca a senha de uma URL de conexão por ****. */
export function maskDatabaseUrl(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/[^:/@]*:)[^@]*@/i, '$1****@');
}

/** Linhas CHAVE=valor da configuração efetiva, com segredos mascarados. */
export function describeConfig(config: AppConfig, env: EnvSource = process.env): string[] {
  const tz = env.TZ !== undefined && env.TZ !== '' ? env.TZ : '(não definido)';
  return [
    `NODE_ENV=${config.nodeEnv}`,
    `HOST=${config.host}`,
    `PORT=${config.port}`,
    `TZ=${tz}`,
    `DATABASE_URL=${maskDatabaseUrl(config.databaseUrl)}`,
    `GATEWAY_MODE=${config.gateway.mode}`,
    `GATEWAY_DELAY_SCALE=${config.gateway.delayScale}`,
    `PARTNER_API_KEY=${config.partnerApiKey}`,
    'SESSION_SECRET=****',
    `LOG_LEVEL=${config.logLevel}`,
  ];
}
