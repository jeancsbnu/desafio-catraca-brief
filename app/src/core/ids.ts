// Identificadores com prefixo: "<prefixo>_" + 16 caracteres de [a-z0-9].
import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 16;
// Maior múltiplo de 36 que cabe num byte (252): bytes acima são descartados para não haver viés.
const LIMIT = 256 - (256 % ALPHABET.length);

export function randomToken(length: number = ID_LENGTH): string {
  let out = '';
  while (out.length < length) {
    const bytes = randomBytes(length * 2);
    for (const byte of bytes) {
      if (byte >= LIMIT) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export function newId(prefix: string): string {
  if (!/^[a-z]+$/.test(prefix)) {
    throw new Error(`Prefixo de ID inválido: ${prefix} (use só letras minúsculas)`);
  }
  return `${prefix}_${randomToken(ID_LENGTH)}`;
}
