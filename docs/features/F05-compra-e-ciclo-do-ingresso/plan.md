# Plano de implementação: F05 — Compra e ciclo do ingresso

**Pré-requisitos:**
- F01, F02, F03 e F04 integradas à `main` (aplicação base e CLI; sessões e auxiliares `loginAs`; `app.gateway` e auxiliares de teste do gateway; `app/src/features/eventos/public.ts`, `app.events` e `insertTestEvent`).
- Branch `feat/F05-compra-e-ciclo-do-ingresso` numa worktree própria, com `.env` local de isolamento (`COMPOSE_PROJECT_NAME` e `CATRACA_PORT` próprios), conforme o `AGENTS.md`.
- Stack já existente no `app/` (Node.js 24, TypeScript, Fastify 5, `pg`, Vitest); nenhuma dependência nova.
- Nenhuma variável de ambiente nova: o modo padrão do gateway (tempos do brief) vale para o produto; a escala de atraso só existe no ambiente de testes (F01/F03).
- Spec: `docs/features/F05-compra-e-ciclo-do-ingresso/spec.md`; contrato congelado: `contract.md` da mesma pasta.

### Fase 1: Modelo de dados e domínio do ingresso

**1. Tabela de ingressos** - Criar a migration da tabela de ingressos com as restrições de formato e coerência, o índice único do código, os índices de contagem por evento e de "Meus ingressos" e a guarda de transições de status no banco, exatamente como a seção 6 da spec descreve.

**2. Pool com tamanho configurável** - Fazer o ajuste mínimo e compatível na criação do pool da F01 para aceitar um tamanho máximo opcional, mantendo o comportamento atual quando ele não é informado (spec, P16).

**3. Tipos, constantes e validações** - Criar o módulo `ingressos` com os tipos públicos do ingresso, da compra e das vagas, os rótulos dos status e as validações de cartão, e-mail do comprador, id e código do ingresso (spec 5.1 e 5.2).

**4. Gerador de código** - Implementar o gerador do código do ingresso com o alfabeto, o tamanho e a reserva definidos na spec (5.8).

**5. Repositório e vagas** - Implementar o acesso SQL à tabela de ingressos e as funções de vagas ocupadas e disponíveis, unitárias e em lote, seguindo as consultas da seção 6 e a definição de R05 (spec 5.6).

### Fase 2: Compra atômica

**6. Serviço de compra** - Implementar o serviço de compra com a ordem de verificações, a recusa tipada e a transação única que trava o evento, conta as vagas, cria o ingresso com o preço vigente e registra a tentativa de pagamento, desfazendo tudo em caso de falha (spec 5.2 e 5.3).

**7. Módulo da feature** - Criar o plugin `ingressos` na ordem de carga prevista, expondo o serviço para as outras features e preparando os pontos onde os tratadores das features F03 e F04 serão registrados (spec 4 e 5.12).

**8. API pública** - Publicar no arquivo de API pública do módulo exatamente o conjunto de tipos, constantes e funções que F06, F07, F08 e F09 vão consumir (spec 5.1 e 5.13).

### Fase 3: Ciclo do ingresso

**9. Resultado do gateway** - Registrar no gateway o tratador que confirma ou recusa o ingresso só enquanto ele está pendente, ignorando e registrando em log as respostas tardias e as referências desconhecidas (spec 5.4).

**10. Cancelamento e lotação mínima** - Registrar na gestão de eventos o tratador de "evento cancelado", que estorna os confirmados e cancela os pendentes na mesma transação, e o provedor de vagas ocupadas usado pela validação de lotação mínima (spec 5.5 e 5.6).

**11. Consultas e check-in** - Implementar as consultas de ingresso por id, por código normalizado, por conta e por evento, o resumo por status do evento e a operação atômica de check-in que a F08 vai usar (spec 5.1 e 5.7).

### Fase 4: Diagnóstico e apoio às consumidoras

**12. Comando de simulação de compras** - Criar o comando `catraca compra:simular`, que dispara uma ou várias compras simultâneas pelo mesmo serviço de compra e imprime cada resultado, o resumo e as vagas no formato literal da spec (5.9).

**13. Comando de consulta de ingresso** - Criar o comando `catraca ingresso:consultar`, que mostra um ingresso por id ou código, a tentativa de pagamento e as vagas do evento no formato literal da spec (5.10).

**14. Auxiliares para as próximas features** - Criar os auxiliares compartilhados que permitem às features da Wave 5 e da Wave 6 criar ingressos e resolver pagamentos nos próprios testes (spec 5.14).

### Fase 5: Documentação

**15. Fechamento da implementação** - Registrar na seção 10 da spec os desvios entre o planejado e o implementado, com o motivo; completar no `README.md` as decisões "R07 sob concorrência" e o lado da F05 na resposta assíncrona do gateway, além dos dois comandos de diagnóstico; acrescentar ao `AGENTS.md` as linhas de comando e a convenção de uso dos ingressos (spec 5.15); e marcar a F05 como `aguardando_avaliacao` no `docs/state.json`.
