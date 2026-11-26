// Erro de domínio do gateway de pagamento simulado.

export type CodigoErroGateway =
  | 'cartao_invalido'
  | 'referencia_invalida'
  | 'referencia_duplicada'
  | 'tratador_ja_registrado';

export const MENSAGENS_ERRO_GATEWAY: Readonly<Record<CodigoErroGateway, string>> = {
  cartao_invalido: 'Número de cartão inválido: são necessários 16 dígitos',
  referencia_invalida: 'Referência de pagamento inválida',
  referencia_duplicada: 'Já existe uma tentativa de pagamento para esta referência',
  tratador_ja_registrado: 'Já existe um tratador de resultado registrado no gateway',
};

export class ErroGateway extends Error {
  override name = 'ErroGateway';
  readonly codigo: CodigoErroGateway;

  constructor(codigo: CodigoErroGateway, options?: { cause?: unknown }) {
    super(MENSAGENS_ERRO_GATEWAY[codigo], options);
    this.codigo = codigo;
  }
}
