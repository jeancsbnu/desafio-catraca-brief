# Catraca

Venda de ingressos para eventos pequenos: o organizador cria e publica eventos, o participante compra pela vitrine, parceiros vendem pela API e a entrada é controlada por check-in. O produto é construído do zero por agentes, feature a feature, em waves, e cada feature só é dada como pronta quando um avaliador independente aprova o contrato dela.

## Como rodar

**Pré-requisitos:** Docker com Compose v2 (Docker Engine ou Docker Desktop), Git e Node.js LTS (20 ou mais novo). Mais nada: o banco, a aplicação e os testes rodam em containers, e não há `npm install` na raiz.

```bash
git clone https://github.com/jeancsbnu/desafio-catraca-brief.git
cd desafio-catraca-brief
npm run up      # constrói, sobe banco + aplicação, roda migrations e seed e espera ficar saudável
npm run gates   # lint, typecheck e testes automatizados em container (pode rodar com o produto no ar)
npm run down    # derruba containers e rede; o volume do banco é preservado
```

- `npm run up` termina com código 0 quando `GET /health` responde `200 {"status":"ok"}` e imprime os endereços. Em falha (porta ocupada, Docker parado, erro de migration ou seed), termina com código diferente de 0 e mostra o motivo — no caso da aplicação, as últimas linhas do log dela.
- `npm run gates` roda num projeto do Compose separado (`catraca-gates`), com banco próprio em memória e sem portas no host, e imprime o resumo (`[gates] lint`, `typecheck`, `testes` com a quantidade executada e `resultado`). Termina com 0 só se tudo passar. Para rodar só parte dos testes: `npm run gates -- test/f01` ou `npm run gates -- -t "F01-CA03"`.
- `npm run down` pode rodar sem nada no ar (termina com 0). Subir de novo reaproveita o volume: as migrations já aplicadas são puladas e a seed roda outra vez sem duplicar contas. Para apagar os dados: `npm run down` e `docker volume rm catraca_db-data`.
- **Porta e nome do projeto:** padrão `3000` e `catraca`. Para mudar (por exemplo, em worktrees paralelas), use as variáveis `CATRACA_PORT` e `COMPOSE_PROJECT_NAME` no shell ou num arquivo `.env` local (modelo em `.env.example`): `CATRACA_PORT=3001 npm run up`.

## Endereços

| | Endereço |
|---|---|
| Produto (`$WEB`) | `http://localhost:3000` |
| API de parceiros (`$API`) | `http://localhost:3000` |
| Saúde | `http://localhost:3000/health` |
| Área do organizador | `http://localhost:3000/organizador` (`$WEB/organizador`; organizadores da seed) |

`$WEB` e `$API` são o mesmo servidor; as rotas da API de parceiros ficam sob `/api/` (entregues pela F07).

## Credenciais

Contas criadas pela seed em toda subida (sempre com estes dados, sem duplicar):

| Conta | E-mail | Senha | Papel |
|---|---|---|---|
| Organizador A | `organizador.a@catraca.test` | `catraca123` | organizador |
| Organizador B | `organizador.b@catraca.test` | `catraca123` | organizador |
| Participante | `participante@catraca.test` | `catraca123` | participante |

Entrar em `$WEB/entrar`; novas contas de participante em `$WEB/cadastro` (organizador não se cadastra).

**Chave de parceiro:** `parceiro-catraca-dev`, enviada no cabeçalho `X-Api-Key` (a API de parceiros é entregue pela F07). Pode ser trocada pela variável `PARTNER_API_KEY`.

O modo padrão usa o gateway de pagamento **simulado**, sem nenhuma chave de pagamento real.

## Mapa dos artefatos

| Artefato | Onde |
|---|---|
| Brief do produto (regras R01–R13, mensagens, API, gateway, Fluxo do avaliador) | [`docs/brief.md`](docs/brief.md) |
| PRD (features, dependências, waves, critérios de aceite) | [`docs/PRD.md`](docs/PRD.md) |
| Pasta de cada feature: spec, plano, contrato e relatórios de avaliação | `docs/features/<ID>-<nome>/` (`spec.md`, `plan.md`, `contract.md`, `reports/`) — ex.: [`docs/features/F01-fundacao-e-harness/`](docs/features/F01-fundacao-e-harness/) |
| Arquivo de estado do projeto | [`docs/state.json`](docs/state.json) |
| Porta de entrada dos agentes (comandos, regras, convenções) | [`AGENTS.md`](AGENTS.md) (o [`CLAUDE.md`](CLAUDE.md) aponta para ele) |
| Plano de execução do orquestrador | [`docs/plano-de-execucao.md`](docs/plano-de-execucao.md) |
| Skills dos agentes (PRD, spec, implementação, avaliação) | [`.claude/skills/`](.claude/skills/) |
| Aplicação (código, migrations, testes, Dockerfile) | [`app/`](app/) |
| Ambientes do Compose e comandos do host | [`compose.yaml`](compose.yaml), [`compose.gates.yaml`](compose.gates.yaml), [`scripts/`](scripts/) |

**PRs da wave paralela:** a completar após a Wave 2.

## Decisões

- **Stack:** Node.js 24 LTS + TypeScript (ESM, `strict`), Fastify 5, HTML renderizado no servidor com um helper de template tipado que escapa tudo por padrão (sem framework de front), PostgreSQL 16 com o driver `pg` e SQL explícito, Vitest. Por quê: um único runtime (o mesmo do host dos comandos), poucas dependências, transações e travas do PostgreSQL à mão para as regras de concorrência, e páginas simples que o avaliador lê com `curl`. Senhas com `scrypt` do `node:crypto` (sem dependência nativa).
- **Harness:** tudo roda em containers; o host só precisa de Docker, Git e Node.js. `npm run up` usa `docker compose up --build --wait` e a aplicação aplica migrations (SQL com timestamp, tabela de controle, trava consultiva) e a seed idempotente antes de escutar; o healthcheck da imagem consulta `/health`, que confere o banco. Os gates rodam numa imagem própria, num projeto Compose separado com banco em memória, por isso não interferem no ambiente no ar nem em outras worktrees.
- **Configuração:** variáveis de ambiente com padrão (nenhuma obrigatória, sem `.env`); fuso `America/Sao_Paulo` no container, em cada conexão com o banco e nos formatadores; dinheiro sempre em centavos.
- **R07 sob concorrência:** toda compra (vitrine e API passam pelo mesmo serviço, `app.tickets.purchase`) roda numa transação READ COMMITTED que primeiro trava a linha do evento (`SELECT … FOR UPDATE`, a mesma trava da edição de lotação e do cancelamento da F04), depois confere se o evento está publicado, conta os ingressos `pending` + `confirmed` do evento, compara com a lotação e, só então, insere o ingresso `pending` (com o preço da linha travada) e registra a tentativa de pagamento — tudo no mesmo commit. Duas compras do mesmo evento nunca estão ao mesmo tempo entre a trava e o commit: a segunda espera (milissegundos) e, ao obter a trava, conta com uma instrução nova, que já enxerga o ingresso que a primeira acabou de confirmar; por isso as vagas ocupadas nunca passam da lotação. Compras de eventos diferentes travam linhas diferentes e não se esperam; leituras de vagas para exibição não travam nada. Não há contador de vagas: a fonte da verdade são os próprios ingressos (índice `(event_id, status)`), e a recusa do gateway ou o cancelamento só liberam vaga, sem ajuste. A trava desiste depois de 5 s (`lock_timeout`), e qualquer falha (inclusive ao gravar a tentativa de pagamento) desfaz a compra inteira. Como foi provado: rajadas de 30 compras simultâneas, cada uma numa conexão própria, num evento de lotação 5 dão sempre 5 criadas e 25 `sold_out`, repetidas em eventos novos nos testes (`app/test/f05/concorrencia.test.ts`: rajadas repetidas, com amostragem das ocupadas durante a rajada, vitrine + API misturadas, três eventos ao mesmo tempo, corrida com redução de lotação e com cancelamento) e no contrato (`catraca compra:simular --paralelas 30` em 3 eventos novos, com monitor das ocupadas no banco).
- **Resposta assíncrona do gateway:** a solicitação de pagamento grava uma tentativa (`payment_attempts`, só com os 4 últimos dígitos do cartão) com o resultado sorteado pelo final do cartão e um prazo absoluto no relógio do banco (`due_at = requested_at + atraso`, com `clock_timestamp()`), e responde na hora. Um worker no processo da aplicação varre o banco a cada 200 ms com `SELECT … FOR UPDATE SKIP LOCKED` e entrega cada tentativa vencida ao tratador registrado dentro da mesma transação que grava `delivered_at`: efeito e marca são confirmados juntos, exatamente uma vez, mesmo com mais de um worker; se o tratador falha, tudo é desfeito e a tentativa volta com espera crescente (0,2 s até 5 s). Como o estado está no banco, um reinício não perde nada: a primeira varredura roda ao subir e entrega o que venceu com a aplicação parada; o resto sai no prazo original. O atraso é sorteado em faixas internas mais estreitas que as do brief (2,2–4,0 s e 30,5–38,5 s) para que, somadas a espera da varredura e a entrega, o efeito caia sempre entre 2 e 5 s ou entre 30 e 40 s, com folga para quem observa por consulta periódica. A escala de atraso (`GATEWAY_DELAY_SCALE`) só vale com `NODE_ENV=test`. Efeito nos ingressos (F05): a compra grava o ingresso `pending` e a tentativa na mesma transação e responde sem esperar; o tratador registrado pela F05 roda dentro da transação de entrega e faz `UPDATE … WHERE status = 'pending'` (aprovado → `confirmed`, recusado → `declined`, liberando a vaga). O cancelamento do evento muda, na própria transação do cancelamento, `confirmed` → `refunded` e `pending` → `cancelled`; uma resposta que chega depois encontra o ingresso fora de `pending`, não muda nada e fica registrada no log (`ingressos: resultado do gateway ignorado`). Um gatilho no banco (`tickets_guard_update`) recusa qualquer transição fora desse ciclo (por exemplo, `cancelled` ou `refunded` de volta a `confirmed`) e a mudança do valor pago.
- **Check-in atômico:** a decisão de R10 é tomada com a linha do evento travada (`SELECT … FOR UPDATE`, a mesma trava do cancelamento) e a marcação é um `UPDATE` condicional (`confirmed` e sem check-in), então dois check-ins simultâneos liberam uma vez só e um evento cancelado nunca libera entrada.
- **Isolamento da avaliação:** cada feature tem um contrato (`contract.md`) congelado antes da implementação; quem implementa não avalia. O avaliador é um agente com contexto novo que roda o contrato inteiro num clone limpo do commit avaliado e grava um relatório imutável em `reports/` (um arquivo novo por avaliação). Só ele muda o estado da feature para `concluida` ou `reprovada`.
- **Sessão e acesso:** cookie `catraca_sessao` assinado (HMAC-SHA256), `HttpOnly`, `SameSite=Lax`, válido por 12 h, que leva só um token aleatório; a sessão fica na tabela `sessions` (hash do token), por isso `Sair` a encerra de verdade e ela sobrevive a reinícios. Toda a área `/organizador` é protegida por um hook global (visitante → `/entrar`, participante → `403`), e formulários vindos de outro site são recusados pela checagem de origem.
- **Eventos e isolamento:** o evento é sempre carregado por id **e** dono na mesma consulta (evento de outro organizador = inexistente = `404` `Evento não encontrado`, sem nenhum dado), e toda mudança de lotação ou status (e, na F05, toda compra) trava a linha do evento (`SELECT … FOR UPDATE`) antes de ler as vagas ocupadas: a lotação nunca fica abaixo das vagas ocupadas e o cancelamento afeta os ingressos na mesma transação.

## Variáveis de ambiente

Todas opcionais (modelo comentado em [`.env.example`](.env.example)):

| Variável | Padrão | Uso |
|---|---|---|
| `CATRACA_PORT` | `3000` | Porta publicada no host (`npm run up`) |
| `COMPOSE_PROJECT_NAME` | `catraca` | Nome do projeto do Compose; os gates usam `<nome>-gates` |
| `PARTNER_API_KEY` | `parceiro-catraca-dev` | Chave da API de parceiros (`X-Api-Key`) |
| `SESSION_SECRET` | segredo de desenvolvimento | Assinatura das sessões (mínimo de 32 caracteres); trocá-lo encerra todas as sessões abertas |
| `LOG_LEVEL` | `info` | Nível do log JSON da aplicação |

O gateway roda sempre no modo `simulado`; a escala de atraso do gateway (`GATEWAY_DELAY_SCALE`) só é lida no ambiente de testes.

## Comandos de diagnóstico

Com o produto no ar (`npm run up`):

```bash
docker compose exec app catraca help      # lista os comandos
docker compose exec app catraca config    # configuração efetiva (segredos mascarados)
docker compose exec app catraca migrate   # aplica migrations pendentes (normalmente nenhuma)
docker compose exec app catraca seed      # garante as 3 contas da seed, sem duplicar
docker compose exec app catraca gateway:simular 4000000000000001   # simula um pagamento: resultado e tempo
docker compose exec app catraca compra:simular --evento <id> --cartao 4000000000000001 [--paralelas 30]   # compras simultâneas
docker compose exec app catraca ingresso:consultar <id ou código>   # ingresso, pagamento e vagas do evento
docker compose exec db psql -U catraca -d catraca   # banco
```

`compra:simular` cria 1 compra (ou N simultâneas com `--paralelas`, de 1 a 50) num evento pelo mesmo serviço de compra da vitrine e da API, cada uma numa conexão própria: por padrão pelo canal `api` com e-mails `simulacao-<i>@example.com` (`--email <e-mail>` fixa um), ou pelo canal `vitrine` com `--conta <e-mail de participante>`. Imprime uma linha por compra (`criada tkt_… código … status pending valor <centavos>` ou `recusada invalid_request|event_not_available|sold_out`, com a duração), o resumo e as vagas do evento; o cartão é repassado como digitado e nunca é impresso. `ingresso:consultar` aceita o id (`tkt_…`) ou o código (com espaços ou minúsculas) e mostra status, check-in, valor pago, canal, comprador, a tentativa de pagamento (o resultado só aparece depois da entrega) e as vagas do evento.

`gateway:simular` segue a tabela do gateway pelo final do cartão (`0001` aprovado e `0002` recusado em 2–5 s; `0003` aprovado e `0004` recusado em 30–40 s; qualquer outro final recusado em 2–5 s): imprime a solicitação na hora e, quando o worker da aplicação entrega o resultado, uma linha como `aprovado em 3,4 s` (tempo entre solicitação e entrega, no relógio do banco). Com `--sem-esperar`, imprime só a solicitação. O número completo do cartão nunca é gravado nem impresso.

Outras features acrescentam comandos (ex.: simulação do gateway e de compras).
