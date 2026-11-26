// Hash de senha com scrypt (node:crypto), sem dependência nativa.
// Formato: scrypt$<N>$<r>$<p>$<sal base64url>$<hash base64url>
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// Limites aceitos ao verificar um hash armazenado (evita custo absurdo vindo de dado corrompido).
const MAX_COST = 1 << 20;
const MAX_BLOCK_SIZE = 32;
const MAX_PARALLELISM = 16;
const MAX_KEY_LENGTH = 256;

function deriveKey(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function memoryFor(cost: number, blockSize: number): number {
  return 128 * cost * blockSize * 2 + 1024 * 1024;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: memoryFor(COST, BLOCK_SIZE),
  });
  return ['scrypt', COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64url'), key.toString('base64url')].join('$');
}

function parsePositiveInt(text: string | undefined, max: number): number | undefined {
  if (text === undefined || !/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 1 && value <= max ? value : undefined;
}

/** Confere a senha em tempo constante. Hash malformado → false (nunca lança). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const cost = parsePositiveInt(parts[1], MAX_COST);
    const blockSize = parsePositiveInt(parts[2], MAX_BLOCK_SIZE);
    const parallelism = parsePositiveInt(parts[3], MAX_PARALLELISM);
    if (cost === undefined || blockSize === undefined || parallelism === undefined) return false;
    if ((cost & (cost - 1)) !== 0 || cost < 2) return false;
    const saltText = parts[4] ?? '';
    const hashText = parts[5] ?? '';
    if (!/^[A-Za-z0-9_-]+$/.test(saltText) || !/^[A-Za-z0-9_-]+$/.test(hashText)) return false;
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(hashText, 'base64url');
    if (salt.length === 0 || expected.length === 0 || expected.length > MAX_KEY_LENGTH) return false;
    const actual = await deriveKey(password, salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelism,
      maxmem: memoryFor(cost, blockSize),
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
