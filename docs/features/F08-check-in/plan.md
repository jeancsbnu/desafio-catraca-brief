# Plano de implementação: F08 — Check-in

**Pré-requisitos:**
- F01 a F05 integradas à `main` (aplicação base; sessões e auxiliares `loginAs`; gateway simulado; `app/src/features/eventos/public.ts`, `app.events` e `insertTestEvent`; `app/src/features/ingressos/public.ts`, `app.tickets`, `insertTestTicket` e `settlePayments`; comandos `catraca compra:simular` e `catraca ingresso:consultar`).
- Branch `feat/F08-check-in` numa worktree própria, com `.env` local de isolamento (`COMPOSE_PROJECT_NAME` e `CATRACA_PORT` próprios), conforme o `AGENTS.md` — a Wave 5 roda em paralelo com F06 e F07.
- Stack já existente no `app/` (Node.js 24, TypeScript, Fastify 5, `pg`, Vitest); nenhuma dependência nova, nenhuma variável de ambiente nova, nenhuma migration.
- Spec: `docs/features/F08-check-in/spec.md`; contrato congelado: `contract.md` da mesma pasta.

### Fase 1: Regra do check-in

**1. Tipos e textos** - Criar o módulo `checkin` com os tipos dos resultados do check-in e as mensagens exatas de R10 e do código em branco, copiadas byte a byte do brief e do PRD (spec 5.3 e 5.7).

**2. Leitura e normalização do código** - Implementar a leitura do campo do formulário e a normalização do código digitado (espaços das pontas e maiúsculas), reconhecendo o código em branco e o texto sem formato de código como a spec descreve (5.2).

**3. Decisão na ordem de R10** - Implementar a decisão que, dado o evento e o ingresso encontrado, devolve a primeira situação verdadeira da lista de R10, na ordem do brief (spec 5.3).

**4. Check-in atômico** - Implementar o serviço que confere o código numa transação com a linha do evento travada, aplica a decisão e, só na liberação, grava a marcação pela operação de check-in da F05, sem consultar nada quando o código está em branco (spec 5.4).

### Fase 2: Check-in na página de gestão

**5. Seção Check-in** - Registrar na página de gestão da F04 a seção com o campo Código e o botão Validar, com e sem resultado de um envio, exatamente no HTML da spec e em todos os status do evento (5.5).

**6. Rotas de ação** - Registrar a ação de check-in e o redirecionamento do seu endereço sob a página de gestão, protegidas pelo guarda de dono da F04, respondendo o resultado na própria página de gestão e registrando os logs previstos (spec 5.1, 5.6 e 5.8).

**7. Módulo e API pública** - Montar o plugin da feature na ordem de carga prevista, publicar a API pública que a F09 vai usar e criar o auxiliar compartilhado que permite à F09 fazer check-ins nos próprios testes (spec 4 e 5.7).

### Fase 3: Documentação

**8. Fechamento da implementação** - Registrar na seção 10 da spec os desvios entre o planejado e o implementado, com o motivo; acrescentar a linha "Check-in atômico" em `## Decisões` do `README.md` e a convenção de uso do check-in no `AGENTS.md` (spec 5.9); e marcar a F08 como `aguardando_avaliacao` no `docs/state.json`.
