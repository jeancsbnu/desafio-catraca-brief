# AGENTS.md — Catraca

Porta de entrada de qualquer agente neste repositório (o Claude Code chega aqui pelo `CLAUDE.md`). Leia inteiro antes de agir.

## O projeto

A Catraca vende ingressos para eventos pequenos. O produto é construído do zero por agentes, feature a feature, em waves, e cada feature só é dada como pronta quando um avaliador independente aprova o contrato dela.

- Fonte da verdade do produto: [`docs/brief.md`](docs/brief.md) — regras R01–R13, status do ingresso, mensagens exatas, API de parceiros, gateway simulado e o Fluxo do avaliador.
- Requisitos: [`docs/PRD.md`](docs/PRD.md) (gerado na Fase 1).
- Roteiro do orquestrador: [`docs/plano-de-execucao.md`](docs/plano-de-execucao.md).

## Comandos

Todos na raiz do repositório. Pré-requisitos do host: Docker (com Compose v2), Git e Node.js LTS (≥ 20). Não há `npm install` na raiz: o `package.json` da raiz só tem scripts.

| Ação | Comando | Situação |
|---|---|---|
| Subir tudo (constrói, migrations e seed, espera ficar saudável) | `npm run up` | pronto |
| Derrubar tudo (containers e rede; preserva o volume do banco) | `npm run down` | pronto |
| Gates (lint, typecheck, testes) em container, projeto Compose `<projeto>-gates` | `npm run gates` | pronto |
| Gates com filtro do Vitest (nome de arquivo ou `-t <nome do teste>`) | `npm run gates -- <filtro>` | pronto |
| Comandos de diagnóstico dentro do container (`help`, `migrate`, `seed`, `config`) | `docker compose exec app catraca <comando>` | pronto |
| Simula um pagamento (finais `0001`–`0004`) e mostra resultado e tempo | `docker compose exec app catraca gateway:simular <cartão>` | pronto |
| Banco (psql) | `docker compose exec db psql -U catraca -d catraca` | pronto |

- **Endereços:** `$WEB` = `$API` = `http://localhost:3000` (produto e API de parceiros no mesmo servidor).
- **Credenciais da seed e chave de parceiro:** [`README.md`](README.md), seção "Credenciais".
- `npm run gates` roda com o ambiente do `npm run up` no ar sem tocar nele (banco próprio, sem portas no host) e termina com 0 só se lint, typecheck e testes passarem.

## Ambiente por worktree

- Cada worktree que sobe o ambiente usa um `.env` local (não versionado; modelo em `.env.example`) com nome de projeto e porta próprios, por exemplo `COMPOSE_PROJECT_NAME=catraca-f02` e `CATRACA_PORT=3002`. A variável do shell vale mais que o `.env`; sem nenhuma, valem `catraca` e `3000`.
- Os gates usam o projeto `<COMPOSE_PROJECT_NAME>-gates` (ex.: `catraca-f02-gates`): worktrees diferentes rodam gates ao mesmo tempo sem colidir.
- Comandos `docker compose ...` manuais numa worktree leem o mesmo `.env` (o Compose o carrega da raiz).
- Ao terminar, derrube o ambiente da worktree com `npm run down`.

## Convenções de código

- **Layout:** aplicação em `app/` (Node.js 24 + TypeScript ESM `strict`, Fastify 5, PostgreSQL 16 com `pg` e SQL explícito, Vitest); comandos do host em `scripts/` (Node, só módulos nativos); `compose.yaml` (ambiente) e `compose.gates.yaml` (gates).
- **Módulos de feature:** cada feature vive em `app/src/features/<nome>/` com `index.ts` exportando como `default` um plugin Fastify assíncrono; a aplicação carrega a pasta sozinha (ninguém edita registro central). `export const loadOrder = <n>` opcional (padrão 100; menor carrega antes; empate pelo nome da pasta). Pastas iniciadas por `_` são ignoradas. Para afetar todas as rotas (hook, decorator de request), envolva o plugin com `fastify-plugin`.
- **Sessão e acesso:** importe só de `app/src/features/contas/public.ts` (`request.user`, `requireOrganizer`, `requireParticipant`, `currentUser`, `loginPath`); tudo sob `/organizador` já é protegido; nos testes, `loginAs`/`sessionCookieFor` de `app/test/helpers/session.ts`.
- **Eventos:** importe só de `app/src/features/eventos/public.ts`; seções da página de gestão por `app.events.addManagementSection`, rotas de ação em `${EVENT_ROUTE_PREFIX}/<acao>` com `requireOwnedEvent`; quem mexe com vagas trava a linha do evento com `lockEventForUpdate`; nos testes, `insertTestEvent` de `app/test/helpers/events.ts`.
- **Páginas:** `reply.page({ title, content, messages?, status? })` responde o documento completo no layout comum; HTML sempre pelo tagged template `html` (escapa tudo), `raw` só para HTML gerado pelo próprio código. Links no topo entram por `app.layout.addNavContributor({ name, order, render })`.
- **Recursos compartilhados:** `app.config`, `app.db`, `app.layout`, `app.backgroundJobs` (tarefas em segundo plano só quando `true`; nos testes é `false`). Transações com `withTransaction` (`app/src/db/transaction.ts`).
- **Migrations:** arquivo novo em `app/migrations/` com nome `$(date -u +%Y%m%d%H%M%S)_<nome_em_snake_case>.sql`; aplicadas na subida, em ordem de nome, uma transação por arquivo. Nunca edite uma migration já integrada à `main` (o runner recusa checksum diferente): crie outra.
- **CLI de diagnóstico:** arquivo novo em `app/src/cli/commands/` exportando `name`, `description` e `run({ args, config, db, print })` vira `catraca <nome>`.
- **Testes:** em `app/test/<fNN>/` (ex.: `app/test/f02/`), com o ID do critério no nome do teste (ex.: `F02-CA01 ...`). Helpers em `app/test/helpers/`: `createTestApp`, `testDb`, `resetDatabase`, `withTemporaryDatabase`, `seedAccounts`. O banco é limpo antes de cada teste; os testes só rodam num banco terminado em `_test`.
- **Dados:** IDs `text` com prefixo (`usr_`, `evt_`, `tkt_`, `pay_`) via `newId(prefixo)`; dinheiro sempre em centavos (inteiro); datas `timestamptz`; fuso do produto `America/Sao_Paulo` (`formatBRL`, `formatDateTimeBR`, `toIsoWithOffset` em `app/src/core/format.ts`).
- **Configuração:** variáveis de ambiente com padrão em `app/src/config.ts` (`DATABASE_URL`, `PORT`, `SESSION_SECRET`, `GATEWAY_MODE=simulado`, `GATEWAY_DELAY_SCALE` só com `NODE_ENV=test`, `PARTNER_API_KEY`, `LOG_LEVEL`); nenhuma é obrigatória e não existe chave de pagamento.
- **Estilo:** identificadores em inglês; textos de interface, logs e mensagens em pt-BR. O projeto não tem formatador automático; o ESLint roda só em `app/`.

## Ciclo de trabalho

| Passo | Quem | Como | Onde |
|---|---|---|---|
| 1. PRD | orquestrador | `/prd-writer` | `main` |
| 2. Spec, plano e contrato | orquestrador | `/spec-writer Fxx` ou `/spec-writer wave N` | `main`, commitado antes de implementar |
| 3. Implementação | agente implementador | `/implement-feature Fxx` | branch `feat/Fxx-<nome>` (worktree) |
| 4. Avaliação | agente avaliador, **contexto novo** | `/evaluate-feature Fxx` | mesma branch, commit avaliado registrado |
| 5. Correção | agente implementador | `/implement-feature <relatório>` | mesma branch; depois nova avaliação |
| 6. Integração | orquestrador | PR → `main`, gates na `main` | GitHub |

Uma wave só começa quando todas as features da wave anterior estão concluídas e integradas.

## Regras do projeto

1. **O brief manda.** Mensagens, status, valores da API, códigos de erro e tempos do gateway são copiados byte a byte de `docs/brief.md`, com acentos.
2. **Quem implementa não avalia.** O implementador nunca edita `contract.md`, nunca escreve em `reports/`, nunca marca critérios no PRD e nunca põe uma feature como `concluida`.
3. **Relatórios são imutáveis.** Uma avaliação = um arquivo novo em `reports/`, commitado uma vez. Nunca editar, fazer amend ou reescrever commit de relatório. Formatadores e linters ignoram `docs/features/*/reports/`.
4. **Contrato congela no commit.** Alteração só antes da primeira avaliação, registrada na seção "Alterações do contrato".
5. **Uma feature por branch.** Em wave paralela, mexa só nos arquivos da sua feature e nos pontos de extensão que a spec prevê; não reformate nem reorganize arquivos compartilhados.
6. **Modo padrão = avaliador.** O gateway simulado segue os tempos do brief e funciona sem nenhuma chave real. Escala de atraso, se existir, só no ambiente de teste.
7. **Linux primeiro.** O avaliador usa Linux ou macOS com Docker, Git e Node.js LTS. Desenvolvimento no WSL; finais de linha LF; scripts em Node ou `sh` POSIX; nada que dependa de Windows. Qualquer runtime além do Node roda em container.
8. **Ambiente isolado por worktree.** Ao subir o ambiente numa worktree, use nome de projeto do Compose e portas próprias (`.env` local, fora do git) para não colidir com outras worktrees.
9. **Sem segredos no git.** `.env` não é commitado; credenciais de desenvolvimento ficam no README.
10. **Commits:** `feat(Fxx): …`, `fix(Fxx): …`, `docs(Fxx): …`, `eval(Fxx): …`, `chore: …`. Nada de `git add -A`; não pular hooks.

## Mapa dos artefatos

| Artefato | Caminho |
|---|---|
| README (como rodar, endereços, credenciais, decisões) | `README.md` |
| Brief | `docs/brief.md` |
| Plano de execução | `docs/plano-de-execucao.md` |
| PRD | `docs/PRD.md` |
| Spec, plano e contrato de cada feature | `docs/features/<ID>-<nome>/spec.md`, `plan.md`, `contract.md` |
| Relatórios de avaliação | `docs/features/<ID>-<nome>/reports/<AAAA-MM-DD-HHMMSS>.md` |
| Estado do projeto | `docs/state.json` |
| Aplicação (código, migrations, testes, Dockerfile) | `app/` |
| Ambientes do Compose (produto e gates) | `compose.yaml`, `compose.gates.yaml` |
| Comandos do host (`up`, `down`, `gates`) | `scripts/` |
| Skills | `.claude/skills/prd-writer`, `spec-writer`, `implement-feature`, `evaluate-feature` |

## Estado do projeto

`docs/state.json` é a memória entre sessões: uma entrada por feature com `nome`, `wave`, `status`, `branch`, `pr` e `ultimo_relatorio`. Cada agente altera só a entrada da sua feature.

| Status | Quem define |
|---|---|
| `pendente` | orquestrador, ao popular a partir do PRD |
| `especificada` | `spec-writer` |
| `em_implementacao` | orquestrador, no primeiro commit da branch |
| `aguardando_avaliacao` | `implement-feature`, com a auto-checagem do contrato verde |
| `reprovada` / `concluida` | `evaluate-feature`, junto com o caminho do relatório |
