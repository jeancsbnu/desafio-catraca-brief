# Plano de implementação: F09 — Painel do evento

**Pré-requisitos:**
- F01 a F08 concluídas e integradas à `main` (a Wave 6 só começa depois da Wave 5): página de gestão com seções e isolamento por dono (F04), resumo dos ingressos e vagas (F05), compra pela vitrine (F06), API de parceiros (F07) e check-in na página de gestão (F08).
- Node.js 24 + TypeScript e Docker com Compose v2, com os comandos `npm run up`, `npm run down` e `npm run gates` do `AGENTS.md`.
- Nenhuma variável de ambiente nova, nenhuma migration, nenhum comando de diagnóstico novo.
- Worktree própria com `.env` local (`COMPOSE_PROJECT_NAME`, `CATRACA_PORT`) para não colidir com outros ambientes.

### Fase 1: Cálculo dos números

**1. Leitura do painel num instante único** - Criar o módulo `painel` com a função que lê o evento e o resumo dos ingressos do mesmo instante do banco, numa transação somente leitura, e calcula os seis números com as definições de R12 e a regra de vagas da F05 (spec, 5.3 e 5.4). Rejeitar resumos impossíveis como erro de programação.

**2. Marcação e formatação** - Escrever o HTML da seção com o título, os seis rótulos exatos do brief, a marcação estável de cada número e a receita no formato do formatador de dinheiro da F01, além do conteúdo de painel indisponível (spec, 5.2, 5.5 e 5.6).

### Fase 2: Seção na página de gestão

**3. Registro da seção** - Registrar a seção `painel` na página de gestão pelo ponto de extensão da F04, abaixo do check-in, presente em todos os status do evento, sem nenhuma rota própria, para que o isolamento por dono venha da própria página (spec, 5.1).

**4. Falha isolada** - Fazer a seção capturar qualquer erro do cálculo, registrar o log de erro e mostrar o painel indisponível, mantendo o restante da página de gestão (inclusive o check-in) funcionando (spec, 5.6 e 5.7).

### Fase 3: Documentação

**5. Fechamento da implementação** - Registrar na spec os desvios em relação ao planejado, acrescentar a linha do painel em "Decisões" do `README.md` e em "Convenções de código" do `AGENTS.md` (spec, 5.8) e marcar a F09 como `aguardando_avaliacao` no `docs/state.json`.
