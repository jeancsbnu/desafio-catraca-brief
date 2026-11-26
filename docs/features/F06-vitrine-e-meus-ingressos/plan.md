# Plano de implementação: F06 — Vitrine e Meus ingressos

**Pré-requisitos:**
- F01 a F05 integradas à `main` (Wave 5 só começa depois da Wave 4): layout e `reply.page`, formatadores de data e dinheiro; sessão, `requireParticipant` com `allowOrganizer`/`returnTo`, `loginPath` e checagem de origem da F02; `app/src/features/eventos/public.ts` da F04; `app/src/features/ingressos/public.ts`, `app.tickets` e o comando `compra:simular` da F05; auxiliares de teste `loginAs`, `insertTestEvent`, `insertTestTicket` e `settlePayments`. Conferir a seção 10 (desvios) das specs da F02, F04 e F05 antes de começar.
- Branch `feat/F06-vitrine-e-meus-ingressos` numa worktree própria, com `.env` local de isolamento (`COMPOSE_PROJECT_NAME` e `CATRACA_PORT` próprios), conforme o `AGENTS.md`. F07 e F08 são implementadas ao mesmo tempo: mexer só nos módulos `vitrine` e `meus-ingressos`, nos testes da F06, numa linha do README e na própria spec.
- Nenhuma dependência npm nova, nenhuma migration e nenhuma variável de ambiente nova.
- Leitura obrigatória antes de começar: `spec.md` (a seção 5 traz rotas, HTML linha a linha, mensagens e a ordem de processamento da compra) e `contract.md` (o que o avaliador vai executar).

### Fase 1: Vitrine e página do evento

**1. Textos e caminhos** - Reunir nos dois módulos da feature as mensagens exatas do brief e da spec, os caminhos da página do evento, da compra e de "Meus ingressos" depois da compra, e a verificação, no registro do módulo da vitrine, de que os módulos de eventos e de ingressos já foram carregados (spec 4, 5.6 e P20).

**2. Vitrine** - Substituir o conteúdo provisório da página inicial pela tabela dos eventos à venda, na ordem da data de início, com data e hora, local, preço, vagas disponíveis e a coluna de compra, mantendo título, cabeçalho e mensagem de vitrine vazia da F01 (spec 5.2 e P02).

**3. Página do evento** - Criar a página pública do evento com os dados, as vagas e o bloco de compra nas quatro variantes e na precedência da spec, e a página `Evento não encontrado` idêntica para rascunho, cancelado, inexistente e id inválido (spec 5.3).

### Fase 2: Compra pela vitrine

**4. Leitura do cartão e tradução do resultado** - Implementar a leitura do número do cartão sem espaços em branco e a tradução de cada resultado do serviço de compra da F05 na resposta da vitrine: redirecionamento para "Meus ingressos", cartão inválido, esgotado, evento indisponível e erro (spec 5.4 e P08–P10).

**5. Rota de compra** - Registrar o envio da compra protegido pelo guarda de participante da F02 com volta à página do evento e passagem do organizador para a mensagem própria, na ordem de processamento da spec, chamando o serviço de compra pelo canal da vitrine com a conta da sessão (spec 5.4 e P07).

### Fase 3: Meus ingressos

**6. Lista de ingressos da conta** - Substituir o conteúdo mínimo de "Meus ingressos" pela tabela dos ingressos comprados pela vitrine com a conta logada, do mais recente para o mais antigo, com nome e data do evento (inclusive cancelado), rótulo do status e código, mantendo o guarda, o cabeçalho e a mensagem de lista vazia da F02 (spec 5.5 e P12).

**7. Mensagem de compra registrada** - Mostrar `Compra registrada` no topo de "Meus ingressos" só quando a página vem do redirecionamento da compra (spec 5.5 e P11).

### Fase 4: Documentação

**8. README** - Acrescentar à tabela de Endereços do README a linha da vitrine, da página do evento e de "Meus ingressos", sem outras mudanças em arquivos compartilhados (spec 5.8).

**9. Fechamento da implementação** - Registrar na seção 10 da spec os desvios em relação ao planejado (inclusive qualquer ajuste em testes de outras features) e marcar a F06 como `aguardando_avaliacao` no `docs/state.json`.
