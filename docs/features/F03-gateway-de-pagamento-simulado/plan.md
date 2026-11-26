# Plano de implementação: F03 — Gateway de pagamento simulado

**Pré-requisitos:**
- F01 integrada à `main` (carregador de módulos com `loadOrder`, `app.backgroundJobs`, runner de migrations com timestamp, CLI `catraca` com descoberta de comandos, configuração `GATEWAY_MODE`/`GATEWAY_DELAY_SCALE`, infraestrutura de testes). A branch `feat/F03-gateway-de-pagamento-simulado` parte da `main` depois desse merge.
- Wave paralela com a F02: trabalhar só nos arquivos listados na spec (seção 1, "Wave paralela", e seção 4); `.env` local da worktree com `COMPOSE_PROJECT_NAME` e `CATRACA_PORT` próprios e **nenhuma** variável `GATEWAY_*`.
- Nenhuma dependência nova no `app/package.json` (só `pg`, `fastify-plugin` e `node:crypto`, já presentes).
- Leitura obrigatória antes de começar: `spec.md` (seções 5 e 6 trazem interfaces, orçamento de tempo, saída literal da CLI, logs e o SQL) e `contract.md` (o que o avaliador vai executar, com o ambiente do `npm run up` no modo padrão).

### Fase 1: Persistência e sorteio

**1. Tabela de tentativas** - Criar a migration com timestamp próprio para a tabela de tentativas de pagamento, com as restrições e os índices descritos na seção 6 da spec (inclusive a garantia de que só os últimos dígitos do cartão podem ser gravados).

**2. Tabela de respostas e sorteio** - Implementar a regra por final do cartão copiada do brief e o sorteio uniforme do atraso dentro das faixas internas, com a escala de atraso aplicada e o gerador de números injetável (seção 5.2).

**3. Solicitação de autorização** - Implementar o registro imediato da tentativa com prazo absoluto no relógio do banco, na conexão do pool ou na transação recebida do chamador, com as validações defensivas, o erro de domínio e a tradução da referência repetida (seções 5.1 e 6).

### Fase 2: Entrega assíncrona

**4. Registro de tratadores** - Criar a fábrica do gateway por instância, com o registro do tratador único das compras, o tratador interno das tentativas de diagnóstico e a consulta de tentativa que só revela o resultado depois da entrega (seção 5.1).

**5. Varredura e entrega** - Implementar a varredura que trava uma tentativa vencida por vez sem bloquear outros workers, chama o tratador na mesma transação que marca a entrega, trata falhas com reentrega e espera crescente, e o laço com primeira varredura imediata, parada limpa e logs fixos (seções 5.3 e 5.5).

**6. Módulo de feature** - Criar o plugin do gateway com o decorator visível às outras features, a ordem de carga, o início do worker só no processo da aplicação e a parada no encerramento, além dos tipos públicos e do arquivo de exportações para as consumidoras (seções 5.1 e 5.6).

### Fase 3: Diagnóstico e apoio às consumidoras

**7. Comando de diagnóstico** - Criar o comando `gateway:simular` com a saída literal, a opção de não esperar, o limite de espera e os códigos de saída da seção 5.4, sem nunca exibir o número completo do cartão.

**8. Apoio aos testes da F05** - Acrescentar o auxiliar de testes que vence tentativas, dispara a varredura e aguarda a entrega, para a compra testar o ciclo do ingresso sem esperar os tempos reais (seção 5.7).

### Fase 4: Documentação

**9. README e AGENTS.md** - Acrescentar o comando de diagnóstico ao README e à tabela de comandos do `AGENTS.md` e preencher no README a decisão sobre o gateway assíncrono, com mudanças pontuais para não conflitar com a F02 (seção 4, Documentação).

**10. Fechamento da implementação** - Registrar na seção 10 da spec os desvios em relação ao planejado (inclusive o nome final da migration) e marcar a F03 como `aguardando_avaliacao` no `docs/state.json`.
