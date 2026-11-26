# AGENTS.md — Catraca

Porta de entrada de qualquer agente neste repositório (o Claude Code chega aqui pelo `CLAUDE.md`). Leia inteiro antes de agir.

## O projeto

A Catraca vende ingressos para eventos pequenos. O produto é construído do zero por agentes, feature a feature, em waves, e cada feature só é dada como pronta quando um avaliador independente aprova o contrato dela.

- Fonte da verdade do produto: [`docs/brief.md`](docs/brief.md) — regras R01–R13, status do ingresso, mensagens exatas, API de parceiros, gateway simulado e o Fluxo do avaliador.
- Requisitos: [`docs/PRD.md`](docs/PRD.md) (gerado na Fase 1).
- Roteiro do orquestrador: [`docs/plano-de-execucao.md`](docs/plano-de-execucao.md).

## Comandos

| Ação | Comando | Situação |
|---|---|---|
| Subir tudo (com seed) | `npm run up` | criado pela F01 |
| Derrubar tudo | `npm run down` | criado pela F01 |
| Gates (lint, typecheck, testes) | `npm run gates` | criado pela F01 |

Até a F01 ser integrada não existe ambiente. A F01 atualiza esta tabela com os comandos reais, os endereços (`$WEB`, `$API`) e onde ficam as credenciais da seed e a chave de parceiro (README).

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
| Brief | `docs/brief.md` |
| Plano de execução | `docs/plano-de-execucao.md` |
| PRD | `docs/PRD.md` |
| Spec, plano e contrato de cada feature | `docs/features/<ID>-<nome>/spec.md`, `plan.md`, `contract.md` |
| Relatórios de avaliação | `docs/features/<ID>-<nome>/reports/<AAAA-MM-DD-HHMMSS>.md` |
| Estado do projeto | `docs/state.json` |
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
