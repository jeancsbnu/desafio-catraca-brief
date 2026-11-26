// Código do ingresso (R09, spec 5.8): 8 caracteres A-Z0-9 sorteados com crypto, sem viés.
import { randomBytes } from 'node:crypto';

export const TICKET_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const TICKET_CODE_LENGTH = 8;
/** Nunca gerados: ZZZZZZZZ é o "código inexistente" do Fluxo do avaliador e do F08-CA05. */
export const RESERVED_TICKET_CODES: readonly string[] = Object.freeze(['ZZZZZZZZ']);

// Maior múltiplo de 36 que cabe num byte (252): bytes a partir dele são descartados (sem viés).
const LIMIT = 256 - (256 % TICKET_CODE_ALPHABET.length);

export type RandomBytes = (size: number) => Uint8Array;

export function generateTicketCode(random: RandomBytes = randomBytes): string {
  for (;;) {
    let code = '';
    while (code.length < TICKET_CODE_LENGTH) {
      for (const byte of random(TICKET_CODE_LENGTH * 2)) {
        if (byte >= LIMIT) continue;
        code += TICKET_CODE_ALPHABET[byte % TICKET_CODE_ALPHABET.length];
        if (code.length === TICKET_CODE_LENGTH) break;
      }
    }
    if (!RESERVED_TICKET_CODES.includes(code)) return code;
  }
}
