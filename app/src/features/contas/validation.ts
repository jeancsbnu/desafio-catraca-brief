// Regras e mensagens dos formulários de cadastro e de login.

export const MESSAGES = {
  nameRequired: 'Informe o nome',
  nameTooLong: 'O nome pode ter no máximo 100 caracteres',
  emailInvalid: 'Informe um e-mail válido',
  passwordTooShort: 'A senha precisa ter pelo menos 8 caracteres',
  emailTaken: 'E-mail já cadastrado',
  loginFailed: 'E-mail ou senha inválidos',
} as const;

const NAME_MAX = 100;
const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Tem caractere de controle (U+0000–U+001F ou U+007F)? */
export function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Campo do formulário como texto; ausente ou não-texto (ex.: campo repetido) vale texto vazio. */
function field(body: unknown, name: string): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : '';
}

function lengthInCodePoints(text: string): number {
  return [...text].length;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

export type SignupValidation =
  | { ok: true; value: SignupInput }
  | { ok: false; errors: string[]; value: SignupInput };

/**
 * Valida o cadastro: nome e e-mail sem espaços nas pontas, senha como digitada. Junta as mensagens
 * na ordem Nome, E-mail, Senha. Campos extras (papel, role...) são ignorados.
 */
export function validateSignup(body: unknown): SignupValidation {
  const value: SignupInput = {
    name: field(body, 'nome').trim(),
    email: field(body, 'email').trim(),
    password: field(body, 'senha'),
  };
  const errors: string[] = [];

  // O PostgreSQL não guarda o caractere nulo em texto: nome ou e-mail com caracteres de controle
  // contam como não informado / inválido (em vez de virar erro 500).
  if (value.name === '' || hasControlChars(value.name)) errors.push(MESSAGES.nameRequired);
  else if (lengthInCodePoints(value.name) > NAME_MAX) errors.push(MESSAGES.nameTooLong);

  if (
    !EMAIL_PATTERN.test(value.email) ||
    hasControlChars(value.email) ||
    lengthInCodePoints(value.email) > EMAIL_MAX
  ) {
    errors.push(MESSAGES.emailInvalid);
  }

  if (lengthInCodePoints(value.password) < PASSWORD_MIN) errors.push(MESSAGES.passwordTooShort);

  return errors.length === 0 ? { ok: true, value } : { ok: false, errors, value };
}

export interface LoginInput {
  email: string;
  password: string;
  voltar: string;
}

/** Lê o login: e-mail sem espaços nas pontas, senha como digitada, voltar cru (validado depois). */
export function readLoginForm(body: unknown): LoginInput {
  return {
    email: field(body, 'email').trim(),
    password: field(body, 'senha'),
    voltar: field(body, 'voltar'),
  };
}
