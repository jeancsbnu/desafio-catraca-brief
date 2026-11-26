// O que outras features podem importar do gateway (importe só daqui).
export { criarGatewaySimulado, type OpcoesGateway } from './gateway.js';
export { ErroGateway, type CodigoErroGateway } from './erros.js';
export { FAIXA_LENTA_MS, FAIXA_RAPIDA_MS, type FaixaMs } from './tabela.js';
export type {
  GatewaySimulado,
  OpcoesSolicitacao,
  OrigemTentativa,
  PedidoAutorizacao,
  ResultadoPagamento,
  SolicitacaoRegistrada,
  TentativaPagamento,
} from './types.js';
