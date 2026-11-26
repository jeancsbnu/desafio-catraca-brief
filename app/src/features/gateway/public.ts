// O que outras features podem importar do gateway (importe só daqui).
export { criarGatewaySimulado, type OpcoesGateway } from './gateway.js';
export { ErroGateway, type CodigoErroGateway } from './erros.js';
export { FAIXA_LENTA_MS, FAIXA_RAPIDA_MS, type FaixaMs } from './tabela.js';
export { INTERVALO_VARREDURA_MS } from './worker.js';
export type {
  EntregaResultado,
  GatewaySimulado,
  LoggerGateway,
  OpcoesSolicitacao,
  OrigemTentativa,
  PedidoAutorizacao,
  ResultadoPagamento,
  ResultadoVarredura,
  SolicitacaoRegistrada,
  TentativaPagamento,
  TratadorResultado,
} from './types.js';
