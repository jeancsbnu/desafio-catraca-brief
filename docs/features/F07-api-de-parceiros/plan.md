# Plano de implementação: F07 — API de parceiros

**Pré-requisitos:**
- F01 a F05 integradas à `main`: carregador de módulos, configuração com `PARTNER_API_KEY`, `withTransaction` e `toIsoWithOffset` (F01); hooks globais da F02 que já ignoram `/api/`; `app/src/features/eventos/public.ts` com `listEventsOnSale` (F04); `app/src/features/ingressos/public.ts` com `app.tickets`, vagas, consulta por id e validações (F05); auxiliares de teste `loginAs`, `insertTestEvent`, `insertTestTicket` e `settlePayments`.
- Branch `feat/F07-api-de-parceiros` numa worktree própria, com `.env` local de isolamento (`COMPOSE_PROJECT_NAME` e `CATRACA_PORT` próprios), conforme o `AGENTS.md`. Wave paralela com F06 e F08: mexer só nos arquivos da F07 e nos acréscimos pontuais de documentação previstos.
- Stack já existente no `app/` (Node.js 24, TypeScript, Fastify 5, `fastify-plugin`, Vitest); nenhuma dependência nova.
- Nenhuma variável de ambiente nova: a chave de parceiro já é lida da configuração da F01 (padrão `parceiro-catraca-dev`).
- Spec: `docs/features/F07-api-de-parceiros/spec.md`; contrato congelado: `contract.md` da mesma pasta.

### Fase 1: Escopo da API e autenticação

**1. Módulo parceiros** - Criar o módulo da feature, carregado depois de eventos e ingressos e declarando essas dependências, que abre o escopo encapsulado `/api/partner` onde vivem todas as rotas, hooks e tratadores da API, na ordem de registro da spec (4 e 5.1).

**2. Chave de parceiro** - Implementar a verificação do cabeçalho `X-Api-Key` como primeiro passo de toda requisição do escopo, com comparação em tempo constante contra a chave configurada, a resposta `401` do brief e o registro em log sem o valor recebido (spec 5.2).

**3. Respostas comuns do escopo** - Configurar no escopo a leitura do corpo como texto com limite, o tratador de erros que converte falhas de leitura em `422` e erros inesperados em `500`, o tratador 404 que responde depois da chave (com a delegação de parâmetros longos) e os cabeçalhos comuns de todas as respostas (spec 5.6 e 5.7).

### Fase 2: Rotas do contrato fixo

**4. Listagem de eventos à venda** - Expor os eventos publicados com exatamente os cinco campos do brief, a data de início no fuso do produto e as vagas disponíveis da F05, lidos num único instantâneo (spec 5.3).

**5. Compra** - Validar o corpo na borda (tipo de conteúdo, JSON, objeto e os dois campos) e chamar o serviço de compra da F05 pelo canal `api`, traduzindo o resultado e as recusas para os status e corpos do brief, na ordem `422 → 404 → 409` (spec 5.4).

**6. Consulta do ingresso** - Expor o ingresso de qualquer canal pelo id, com exatamente os cinco campos do brief, e a recusa `ticket_not_found` (spec 5.5).

**7. Apoio às próximas features** - Criar os auxiliares compartilhados que permitem à F09 comprar, listar e consultar pela API nos próprios testes (spec 5.9).

### Fase 3: Documentação

**8. Fechamento da implementação** - Registrar na seção 10 da spec os desvios entre o planejado e o implementado, com o motivo; acrescentar ao `README.md` as rotas da API, o exemplo de chamada, o ajuste da linha da chave e a decisão sobre a API, e ao `AGENTS.md` a convenção da API de parceiros (spec 5.10); e marcar a F07 como `aguardando_avaliacao` no `docs/state.json`.
