# Plano de implementação: F04 — Gestão de eventos

**Pré-requisitos:**
- F01, F02 e F03 integradas à `main` (Wave 3 só começa depois da Wave 2): módulos de feature com `loadOrder`, layout e `reply.page`, transações, formatadores de data e dinheiro, runner de migrations, seed, infraestrutura de testes; sessão e `request.user`, `requireOrganizer`, `currentUser`, proteção automática de `/organizador`, checagem de origem e os auxiliares `loginAs`/`sessionCookieFor` da F02. Conferir a seção 10 (desvios) das specs da F02 e da F03 antes de começar.
- Worktree própria (`feat/F04-gestao-de-eventos`); se outra worktree estiver com o ambiente no ar, usar `.env` local com `COMPOSE_PROJECT_NAME` e `CATRACA_PORT` próprios.
- Nenhuma dependência npm nova e nenhuma variável de ambiente nova.
- Leitura obrigatória antes de começar: `spec.md` (seções 5 e 6 trazem rotas, HTML, mensagens, pontos de extensão e SQL exatos) e `contract.md` (o que o avaliador vai executar).

### Fase 1: Modelo de eventos e consultas

**1. Tabela de eventos** - Criar a migration da tabela de eventos com timestamp gerado no momento, com as restrições de formato, faixas e coerência de status e os índices da lista do organizador e dos eventos à venda, conforme a seção 6 da spec.

**2. Tipos e acesso a dados** - Definir o registro do evento, os rótulos de status e as consultas da tabela (por id, por vários ids, do organizador, à venda, com trava da linha e as atualizações de estado), seguindo as seções 5.11 e 6.

**3. Auxiliar de testes para as consumidoras** - Criar o auxiliar que insere eventos de teste em qualquer status, com datas de publicação e cancelamento coerentes, para os testes de F05 a F09 (seção 4).

### Fase 2: Regras, serviço e pontos de extensão

**4. Leitura e validação do formulário** - Implementar a leitura da data e hora no fuso do produto, do preço em reais com vírgula ou ponto e da lotação, e a validação completa do formulário com as mensagens exatas na ordem dos campos, mais os formatos de pré-preenchimento (seção 5.2).

**5. Registros de extensão** - Implementar o objeto de extensões da aplicação com o registro de seções da página de gestão, o provedor de vagas ocupadas, os tratadores de evento cancelado, a renderização da página de gestão para outras features e o congelamento dos registros quando a aplicação fica pronta (seção 5.12).

**6. Serviço de eventos sob trava** - Implementar criação, edição, publicação e cancelamento, cada mudança numa transação que trava a linha do evento, com as regras de estado, a lotação mínima pelo provedor de vagas e os tratadores de cancelamento na mesma transação (seções 5.5 a 5.9 e 5.12.4).

**7. Isolamento por dono** - Implementar o guarda que carrega o evento do organizador logado numa única consulta e responde a mesma página `Evento não encontrado` para evento alheio, inexistente ou com id inválido, e os auxiliares de rota para outras features (seções 5.10 e 5.12.5).

### Fase 3: Área do organizador

**8. Módulo de eventos e lista** - Criar o módulo `eventos` com carregamento depois de contas e gateway, assumir a página `/organizador` removendo o módulo mínimo da F02 e mostrar a lista dos eventos do organizador com o link `Novo evento` (seções 2 e 5.3).

**9. Criação de evento** - Implementar a página `Novo evento` e o envio que cria o rascunho e leva à página de gestão com a mensagem de sucesso, ou mostra os erros acima do formulário com os valores digitados (seções 5.4 e 5.5).

**10. Página de gestão** - Implementar a página de gestão com dados, status, formulário de edição e ações conforme o status, mensagens de sucesso e as seções registradas por outras features (seção 5.6).

**11. Edição e publicação** - Implementar o envio da edição (com data no futuro e lotação não menor que as vagas ocupadas) e a publicação do rascunho, com as respostas de conflito de estado (seções 5.7 e 5.8).

**12. Cancelamento com confirmação** - Implementar a página de confirmação e o cancelamento irreversível do evento publicado, com as recusas para rascunho e evento já cancelado (seção 5.9).

**13. API pública** - Publicar em `public.ts` exatamente as consultas, os guardas, os caminhos, as constantes e os tipos de extensão que as features seguintes vão consumir (seção 5.11).

### Fase 4: Documentação

**14. AGENTS.md e README** - Acrescentar ao README o endereço da área do organizador e a decisão sobre isolamento e trava do evento, e ao `AGENTS.md` a convenção de uso da API de eventos e dos pontos de extensão, só com os acréscimos da seção 5.14 da spec.

**15. Fechamento da implementação** - Registrar na seção 10 da spec os desvios em relação ao planejado (inclusive o nome final da migration e qualquer ajuste em testes de outras features) e marcar a F04 como `aguardando_avaliacao` no `docs/state.json`.
