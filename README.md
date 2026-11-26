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
- **R07 sob concorrência:** a completar na F05.
- **Resposta assíncrona do gateway:** a completar na F03/F05.
- **Isolamento da avaliação:** cada feature tem um contrato (`contract.md`) congelado antes da implementação; quem implementa não avalia. O avaliador é um agente com contexto novo que roda o contrato inteiro num clone limpo do commit avaliado e grava um relatório imutável em `reports/` (um arquivo novo por avaliação). Só ele muda o estado da feature para `concluida` ou `reprovada`.
- **Sessão e acesso:** cookie `catraca_sessao` assinado (HMAC-SHA256), `HttpOnly`, `SameSite=Lax`, válido por 12 h, que leva só um token aleatório; a sessão fica na tabela `sessions` (hash do token), por isso `Sair` a encerra de verdade e ela sobrevive a reinícios. Toda a área `/organizador` é protegida por um hook global (visitante → `/entrar`, participante → `403`), e formulários vindos de outro site são recusados pela checagem de origem.

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
docker compose exec db psql -U catraca -d catraca   # banco
```

Outras features acrescentam comandos (ex.: simulação do gateway e de compras).
