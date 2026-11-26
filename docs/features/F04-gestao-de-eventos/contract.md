# Contrato: F04 — Gestão de eventos

## 1. Pré-requisitos de ambiente

- **Commit avaliado:** o avaliador registra o hash no relatório (`git rev-parse HEAD` na raiz do repositório avaliado — `main`, branch ou worktree da F04).
- **Onde roda:** na raiz da pasta do repositório avaliado, num shell `bash` (Linux, macOS ou WSL). Cada bloco do roteiro começa com `. /tmp/catraca-f04/aux.sh` (criado na Preparação), que entra na raiz do repositório e define variáveis e funções; por isso os blocos podem rodar em shells separados.
- **Subir:** `npm run up` · **Derrubar:** `npm run down` · **Gates:** `npm run gates` (comandos do `AGENTS.md`; nenhum `npm install`). Conforme a skill `evaluate-feature`, o avaliador roda `npm run down` e `npm run up` antes da Preparação.
- **Endereços:** `$WEB` = `$API` = `http://localhost:3000`; se a pasta avaliada tiver um `.env` com `CATRACA_PORT`, a Preparação usa essa porta (nenhum resultado esperado muda: os `location` são caminhos relativos). **Chave de parceiro:** `parceiro-catraca-dev` (README); não é usada neste contrato — a API de parceiros é da F07.
- **Contas da seed:** organizador A (`organizador.a@catraca.test`), organizador B (`organizador.b@catraca.test`), participante (`participante@catraca.test`); senha `catraca123` para as três, conforme o README (seção "Credenciais").
- **Modo:** padrão — nenhuma variável de ambiente exportada no shell; um `.env` local só é aceito com `CATRACA_PORT` e/ou `COMPOSE_PROJECT_NAME`.
- **Ferramentas do avaliador:** `bash`, `git`, `curl`, `awk`, `sed`, `grep`, `cmp`, `docker` com Compose v2, `node` (LTS). Navegador só para o roteiro opcional (2.2).
- **Datas:** a Preparação calcula, no fuso `America/Sao_Paulo`, `PROX` (dia 15 do mês seguinte, 21:00), `DEPOIS` (dia 20 do mês depois do seguinte, 20:30) e `ONTEM` (ontem, 21:00), nos formatos `AAAA-MM-DDTHH:MM` e, com sufixo `_BR`, `DD/MM/AAAA HH:MM`.
- **Ordem e dados:** os itens rodam na ordem numérica. Cada item cria os próprios eventos (nomes com o sufixo `$U`, único por avaliação) e não depende de outro item. Dados criados: eventos dos organizadores A e B; o C01 cria e apaga um banco temporário `catraca_f04_seed_<U>`. Nenhuma conta nova.
- **Duração:** cerca de 3 minutos.

### Preparação (antes do C01)

```bash
# na raiz do repositório avaliado, com o ambiente já subido por npm run up
git status --porcelain | wc -l
git rev-parse HEAD
mkdir -p /tmp/catraca-f04 && rm -rf /tmp/catraca-f04/*
printf "cd '%s'\n" "$(git rev-parse --show-toplevel)" > /tmp/catraca-f04/aux.sh
printf 'U=%s\n' "$(date +%s)" >> /tmp/catraca-f04/aux.sh
TZ=America/Sao_Paulo node -e '
const p = (n) => String(n).padStart(2, "0");
const hoje = new Date();
const a = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 15);
const b = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 20);
const o = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
const iso = (d, h) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${h}`;
const br = (d, h) => `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${h}`;
console.log(`PROX=${iso(a, "21:00")}`);
console.log(`PROX_BR="${br(a, "21:00")}"`);
console.log(`DEPOIS=${iso(b, "20:30")}`);
console.log(`DEPOIS_BR="${br(b, "20:30")}"`);
console.log(`ONTEM=${iso(o, "21:00")}`);
' >> /tmp/catraca-f04/aux.sh
cat >> /tmp/catraca-f04/aux.sh <<'EOF'
T=/tmp/catraca-f04
PORTA=${CATRACA_PORT:-$(sed -n 's/^CATRACA_PORT=//p' .env 2>/dev/null | tail -n 1)}
WEB=http://localhost:${PORTA:-3000}
# req <id> [opções do curl] <url>: imprime o status HTTP e as linhas location/set-cookie; corpo em $T/<id>.html
req() { _id=$1; shift; curl -s -o "$T/$_id.html" -D "$T/$_id.h" -w '%{http_code}\n' "$@"; tr -d '\r' < "$T/$_id.h" | awk '{ i = index($0, ":"); n = tolower(substr($0, 1, i - 1)); if (n == "location" || n == "set-cookie") print n ":" substr($0, i + 1) }'; }
# conta <id> <texto>: ocorrências do texto no corpo guardado
conta() { grep -oF -- "$2" "$T/$1.html" | wc -l | tr -d ' '; }
# tem / naotem <id> <texto>...: presença ou ausência de cada texto no corpo guardado
tem() { _id=$1; shift; for s in "$@"; do grep -qF -- "$s" "$T/$_id.html" && echo "ok: $s" || echo "FALTA: $s"; done; }
naotem() { _id=$1; shift; for s in "$@"; do grep -qF -- "$s" "$T/$_id.html" && echo "INDEVIDO: $s" || echo "ausente: $s"; done; }
sql() { docker compose exec -T db psql -U catraca -d catraca -At -c "$1"; }
entrar() { req "$1" -c "$2" -b "$2" --data-urlencode "email=$3" --data-urlencode "senha=${4-catraca123}" "$WEB/entrar"; }
# criar <id> <cookie jar> <nome> <inicio> <local> <lotacao> <preco>: POST /organizador/eventos
criar() { _c=$1; _j=$2; shift 2; req "$_c" -b "$_j" --data-urlencode "nome=$1" --data-urlencode "inicio=$2" --data-urlencode "local=$3" --data-urlencode "lotacao=$4" --data-urlencode "preco=$5" "$WEB/organizador/eventos"; }
# editar <id> <cookie jar> <evento> <nome> <inicio> <local> <lotacao> <preco>: POST /organizador/eventos/<evento>/editar
editar() { _c=$1; _j=$2; _e=$3; shift 3; req "$_c" -b "$_j" --data-urlencode "nome=$1" --data-urlencode "inicio=$2" --data-urlencode "local=$3" --data-urlencode "lotacao=$4" --data-urlencode "preco=$5" "$WEB/organizador/eventos/$_e/editar"; }
# evid <id>: id do evento no location de uma criação bem-sucedida
evid() { tr -d '\r' < "$T/$1.h" | sed -n 's|^[Ll]ocation: /organizador/eventos/\(evt_[a-z0-9]\{16\}\)?ok=criado$|\1|p'; }
# foto <evento>: estado completo do evento no banco, numa linha (inclui updated_at)
foto() { sql "SELECT name, to_char(starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'), location, capacity, price_cents, status, published_at IS NOT NULL, cancelled_at IS NOT NULL, updated_at FROM events WHERE id = '$1'"; }
EOF
. /tmp/catraca-f04/aux.sh
sed -n '2,7p' /tmp/catraca-f04/aux.sh
curl -s -w '\n%{http_code}\n' "$WEB/health"
sql "SELECT to_regclass('public.events') IS NOT NULL"
entrar pa "$T/a.jar" organizador.a@catraca.test
entrar pb "$T/b.jar" organizador.b@catraca.test
entrar pp "$T/p.jar" participante@catraca.test
```

Esperado:
- `0` (árvore limpa); o hash do commit.
- Seis linhas: `U=<número>`, `PROX=<AAAA-MM>-15T21:00` (mês seguinte ao atual), `PROX_BR="15/<MM>/<AAAA> 21:00"`, `DEPOIS=<AAAA-MM>-20T20:30` (dois meses à frente), `DEPOIS_BR="20/<MM>/<AAAA> 20:30"`, `ONTEM=<data de ontem>T21:00`.
- `{"status":"ok"}` e `200`; `t` (a tabela `events` existe).
- `pa` e `pb`: `302`, `location: /organizador` e [cria]; `pp`: `302`, `location: /` e [cria].

Sem isso, o contrato não é executável.

**Convenções dos resultados esperados:**
- A saída de `req` (e de `criar`/`editar`) é o status na primeira linha e, depois, as linhas `location:`/`set-cookie:`. "Nenhuma outra linha" quer dizer que a resposta não tem `location` nem `set-cookie`.
- **[cria]** = uma linha `set-cookie: catraca_sessao=<valor>; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax` (sessão da F02).
- **[evento]** = a linha `location: /organizador/eventos/evt_<16 caracteres [a-z0-9]>?ok=criado` e nenhuma outra (criação bem-sucedida).
- `<E>`, `<U>`, `<PROX>` etc. indicam o valor da variável no momento da execução.

## 2. Itens verificáveis

A tabela é o índice. Os comandos exatos e o resultado completo de cada item estão no roteiro 2.1, que prevalece sobre o resumo.

| ID | Item | Tipo | Como verificar (resumo) | Resultado esperado (resumo) | Regras |
|----|------|------|-------------------------|-----------------------------|--------|
| C01 | A seed não cria eventos (pendência da F01) | CLI + DB | Banco temporário: `catraca migrate` + `catraca seed` e contagem; no banco do ambiente, `catraca seed` de novo | `events|0|3` no banco novo; contagem de eventos igual antes e depois da seed | — |
| C02 | Organizador A cria evento: nasce `Rascunho`, com id `evt_…` e página de gestão | HTTP + DB | `POST /organizador/eventos` (lotação 2, `100,00`, mês seguinte 21:00); página do `location`; lista; `psql` | `302` [evento]; página com `Evento criado`, `Rascunho`, `15/MM/AAAA 21:00`, `R$ 100,00`, `Publicar`, sem `Cancelar evento`; linha na lista; `rascunho|2|10000|…|organizador.a@catraca.test` | R01, R02, R04 |
| C03 | Lista e formulário `Novo evento` | HTTP | `GET /organizador`, `GET /organizador/eventos/novo` | `Área do organizador`, link `Novo evento`, tabela Nome/Data/Status; formulário com Nome, Data e hora de início, Local, Lotação, Preço (R$) | R04 |
| C04 | Data `DD/MM/AAAA HH:MM` ou `AAAA-MM-DDTHH:MM` no fuso -03:00; preço `100.00` e `R$ 42,5` | HTTP + DB | Duas criações; `psql` com horário local e UTC; página de gestão | `10000` e `4250`; 21:00 local = 00:00 UTC, 20:30 = 23:30 UTC; `R$ 42,50` | R01 |
| C05 | Criar com a data de ontem é rejeitado | HTTP + DB | `POST /organizador/eventos` com `ONTEM` | `422` `A data de início precisa estar no futuro` acima do formulário, valores repostos; nenhum evento criado | R01 |
| C06 | Editar para data passada é rejeitado e nada muda | HTTP + DB | Edição com `ONTEM` em rascunho e em publicado | `422` com a mesma mensagem; linha do evento idêntica (inclusive `updated_at`) | R01 |
| C07 | Lotação `0`/`1,5` e preço `0,00` rejeitados | HTTP + DB | Criação e edição com esses valores | `422` `A lotação precisa ser um número inteiro maior ou igual a 1` e `O preço precisa ser maior que zero`; nada criado nem alterado | R01 |
| C08 | `Publicar` muda o rascunho para `Publicado` | HTTP + DB | `POST …/publicar`; página; lista; `psql`; publicar de novo | `302` `?ok=publicado`; `Evento publicado`, `Publicado`, `Cancelar evento`, sem `Publicar`; `publicado`; segunda vez `409` sem mudança | R02, R04 |
| C09 | Publicado sem compras aceita preço R$ 150,00 e lotação 3 | HTTP + DB | `POST …/editar`; página; `psql` | `302` `?ok=atualizado`; `Evento atualizado`, `R$ 150,00`, lotação 3; `publicado|3|15000` | R03 |
| C10 | Cancelar pede confirmação e muda para `Cancelado` sem formulários | HTTP + DB | `GET …/cancelar`; `POST` sem e com `confirmar=sim`; página; lista; `psql` | Confirmação `Cancelar é irreversível. Confirmar?` sem mudar nada; depois `302` `?ok=cancelado`, `Evento cancelado com sucesso`, `Cancelado`, sem editar/publicar/cancelar | R11 |
| C11 | Evento cancelado: `POST`s diretos de edição, publicação e cancelamento rejeitados | HTTP + DB | `POST …/editar`, `…/publicar`, `…/cancelar`, `GET …/cancelar` | `409` `Este evento foi cancelado e não pode mais ser alterado` nos quatro; linha idêntica | R11 |
| C12 | Rascunho não oferece cancelar e `POST` de cancelamento é rejeitado | HTTP + DB | Página do rascunho; `POST`/`GET …/cancelar` | Sem `Cancelar evento`; `409` `Só evento publicado pode ser cancelado`; linha idêntica | R11 |
| C13 | Organizador B não vê nem opera eventos de A (lista e URL direta) | HTTP + DB | Lista de B; `GET`s e `POST`s de B em eventos de A; id inexistente e inválido; A na URL de B | Lista sem eventos de A; `404` `Evento não encontrado` sem nenhum dado, idêntico ao de evento inexistente; nada alterado | R13 |
| C14 | Visitante não acessa a gestão de eventos | HTTP + DB | Sem cookie: GETs e POSTs das rotas de eventos | `302` `location: /entrar` em todos; nada criado nem alterado | R13 |
| C15 | Participante não acessa a gestão de eventos | HTTP + DB | Com o participante: GETs e POSTs das rotas de eventos | `403` `Acesso negado` sem dados do evento; nada criado nem alterado | R13 |

### 2.1 Roteiro detalhado

#### C01 — A seed não cria eventos (pendência da F01)

```bash
. /tmp/catraca-f04/aux.sh
DBX="catraca_f04_seed_$U"
sql "CREATE DATABASE $DBX"
docker compose exec -T -e DATABASE_URL="postgres://catraca:catraca@db:5432/$DBX" app catraca migrate; echo "exit=$?"
docker compose exec -T -e DATABASE_URL="postgres://catraca:catraca@db:5432/$DBX" app catraca seed; echo "exit=$?"
docker compose exec -T db psql -U catraca -d "$DBX" -At -c "SELECT to_regclass('public.events'), (SELECT count(*) FROM events), (SELECT count(*) FROM users)"
sql "DROP DATABASE $DBX WITH (FORCE)"
N0=$(sql "SELECT count(*) FROM events")
docker compose exec -T app catraca seed; echo "exit=$?"
echo "$N0 $(sql "SELECT count(*) FROM events")"
```

Esperado:
- `CREATE DATABASE`.
- `migrate`: linhas `[catraca] migration aplicada: <id>`, uma delas terminando em `_create_events`, e a linha `[catraca] migrations: aplicadas <n>, já aplicadas 0`; `exit=0`.
- `seed` no banco novo: a saída contém a linha `[catraca] seed: contas garantidas 3 (criadas 3, já existiam 0)`; `exit=0`.
- Consulta no banco novo: exatamente `events|0|3` (a tabela existe, nenhum evento, as 3 contas da seed).
- `DROP DATABASE`.
- `seed` no banco do ambiente: a saída contém `[catraca] seed: contas garantidas 3 (criadas 0, já existiam 3)`; `exit=0`.
- Última linha: dois números iguais (a seed não criou nem apagou eventos).

#### C02 — Organizador A cria evento: nasce `Rascunho`, com id `evt_…` e página de gestão

```bash
. /tmp/catraca-f04/aux.sh
N="Show F04 $U"; L="Bar do Centro F04 $U"
criar c02a "$T/a.jar" "$N" "$PROX" "$L" 2 '100,00'
E=$(evid c02a); echo "$E" | grep -cE '^evt_[a-z0-9]{16}$'
req c02b -b "$T/a.jar" "$WEB/organizador/eventos/$E?ok=criado"
tem c02b 'Evento criado' "<h1>$N</h1>" '<p>Status: <strong data-status="rascunho">Rascunho</strong></p>' "<dt>Data e hora de início</dt><dd>$PROX_BR</dd>" "<dt>Local</dt><dd>$L</dd>" '<dt>Lotação</dt><dd>2</dd>' '<dt>Preço</dt><dd>R$ 100,00</dd>' "<form method=\"post\" action=\"/organizador/eventos/$E/editar\">" "<form method=\"post\" action=\"/organizador/eventos/$E/publicar\"><button type=\"submit\">Publicar</button></form>"
naotem c02b 'Cancelar evento' "/organizador/eventos/$E/cancelar"
req c02c -b "$T/a.jar" "$WEB/organizador"
tem c02c "<tr><td><a href=\"/organizador/eventos/$E\">$N</a></td><td>$PROX_BR</td><td>Rascunho</td></tr>"
sql "SELECT e.status, e.capacity, e.price_cents, to_char(e.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD\"T\"HH24:MI'), e.published_at IS NULL, e.cancelled_at IS NULL, u.email FROM events e JOIN users u ON u.id = e.organizer_id WHERE e.id = '$E'"
```

Esperado:
- `c02a`: `302` e [evento]; `1` (id no formato `evt_` + 16 caracteres).
- `c02b`: `200` e nenhuma outra linha; nove `ok:` e dois `ausente:`.
- `c02c`: `200` e nenhuma outra linha; `ok:`.
- Consulta: `rascunho|2|10000|<PROX>|t|t|organizador.a@catraca.test`.

#### C03 — Lista e formulário `Novo evento`

```bash
. /tmp/catraca-f04/aux.sh
criar c03a "$T/a.jar" "Lista F04 $U" "$PROX" "Local F04 $U" 5 '10,00'
req c03b -b "$T/a.jar" "$WEB/organizador"
tem c03b '<h1>Área do organizador</h1>' '<a href="/organizador/eventos/novo">Novo evento</a>' '<th>Nome</th><th>Data</th><th>Status</th>' ">Lista F04 $U</a>"
req c03c -b "$T/a.jar" "$WEB/organizador/eventos/novo"
tem c03c '<h1>Novo evento</h1>' '<form method="post" action="/organizador/eventos">' '<label for="nome">Nome</label>' '<label for="inicio">Data e hora de início</label>' '<label for="local">Local</label>' '<label for="lotacao">Lotação</label>' '<label for="preco">Preço (R$)</label>' 'name="nome"' 'name="inicio"' 'name="local"' 'name="lotacao"' 'name="preco"' '<button type="submit">Salvar</button>'
```

Esperado: `c03a`: `302` e [evento]; `c03b`: `200` e nenhuma outra linha, quatro `ok:`; `c03c`: `200` e nenhuma outra linha, treze `ok:`.

#### C04 — Data `DD/MM/AAAA HH:MM` ou `AAAA-MM-DDTHH:MM` no fuso -03:00; preço `100.00` e `R$ 42,5`

```bash
. /tmp/catraca-f04/aux.sh
criar c04a "$T/a.jar" "Formato BR F04 $U" "$PROX_BR" "Local F04 $U" 10 '100.00'
E1=$(evid c04a)
criar c04b "$T/a.jar" "Formato ISO F04 $U" "$DEPOIS" "Local F04 $U" 1 'R$ 42,5'
E2=$(evid c04b)
sql "SELECT name, to_char(starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD\"T\"HH24:MI'), to_char(starts_at AT TIME ZONE 'UTC', 'HH24:MI'), price_cents, capacity, status FROM events WHERE id IN ('$E1', '$E2') ORDER BY starts_at"
req c04c -b "$T/a.jar" "$WEB/organizador/eventos/$E2"
tem c04c "<dt>Data e hora de início</dt><dd>$DEPOIS_BR</dd>" '<dt>Lotação</dt><dd>1</dd>' '<dt>Preço</dt><dd>R$ 42,50</dd>' "value=\"$DEPOIS_BR\"" 'value="42,50"'
```

Esperado:
- `c04a` e `c04b`: `302` e [evento].
- Consulta, exatamente duas linhas:
  ```
  Formato BR F04 <U>|<PROX>|00:00|10000|10|rascunho
  Formato ISO F04 <U>|<DEPOIS>|23:30|4250|1|rascunho
  ```
- `c04c`: `200` e nenhuma outra linha; cinco `ok:` (o formulário de edição vem pré-preenchido em `DD/MM/AAAA HH:MM` e `42,50`).

#### C05 — Criar com a data de ontem é rejeitado

```bash
. /tmp/catraca-f04/aux.sh
N0=$(sql "SELECT count(*) FROM events")
criar c05a "$T/a.jar" "Ontem F04 $U" "$ONTEM" "Local F04 $U" 2 '100,00'
conta c05a 'A data de início precisa estar no futuro'
tem c05a "value=\"Ontem F04 $U\"" "value=\"$ONTEM\"" 'value="100,00"'
node -e "const s = require('fs').readFileSync(process.argv[1], 'utf8'); const m = s.indexOf('A data de início precisa estar no futuro'); console.log(m >= 0 && m < s.indexOf('action=\"/organizador/eventos\"'))" "$T/c05a.html"
echo "$N0 $(sql "SELECT count(*) FROM events")"
sql "SELECT count(*) FROM events WHERE name = 'Ontem F04 $U'"
```

Esperado: `c05a`: `422` e nenhuma outra linha; `1`; três `ok:` (valores repostos); `true` (a mensagem aparece antes do formulário); dois números iguais; `0`.

#### C06 — Editar para data passada é rejeitado e nada muda

```bash
. /tmp/catraca-f04/aux.sh
criar c06a "$T/a.jar" "Data F04 $U" "$PROX" "Local F04 $U" 2 '100,00'
E=$(evid c06a); F1=$(foto "$E")
editar c06b "$T/a.jar" "$E" "Data F04 $U" "$ONTEM" "Local F04 $U" 2 '100,00'
conta c06b 'A data de início precisa estar no futuro'
tem c06b "<dt>Data e hora de início</dt><dd>$PROX_BR</dd>" "value=\"$ONTEM\""
[ "$F1" = "$(foto "$E")" ] && echo "rascunho inalterado" || echo "rascunho ALTERADO"
req c06c -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$E/publicar"
F2=$(foto "$E")
editar c06d "$T/a.jar" "$E" "Data F04 $U" "$ONTEM" "Local F04 $U" 2 '100,00'
conta c06d 'A data de início precisa estar no futuro'
[ "$F2" = "$(foto "$E")" ] && echo "publicado inalterado" || echo "publicado ALTERADO"
```

Esperado:
- `c06a`: `302` e [evento].
- `c06b`: `422` e nenhuma outra linha; `1`; dois `ok:` (os dados guardados continuam com a data original; o formulário repõe o valor digitado); `rascunho inalterado`.
- `c06c`: `302` e `location: /organizador/eventos/<E>?ok=publicado`.
- `c06d`: `422` e nenhuma outra linha; `1`; `publicado inalterado`.

#### C07 — Lotação `0`/`1,5` e preço `0,00` rejeitados

```bash
. /tmp/catraca-f04/aux.sh
for v in 0 '1,5'; do printf 'lotacao=%s | %s| %s\n' "$v" "$(criar c07 "$T/a.jar" "Lotacao F04 $U" "$PROX" "Local F04 $U" "$v" '100,00' | tr '\n' ' ')" "$(conta c07 'A lotação precisa ser um número inteiro maior ou igual a 1')"; done
criar c07b "$T/a.jar" "Preco F04 $U" "$PROX" "Local F04 $U" 2 '0,00'
conta c07b 'O preço precisa ser maior que zero'
sql "SELECT count(*) FROM events WHERE name IN ('Lotacao F04 $U', 'Preco F04 $U')"
criar c07c "$T/a.jar" "Valida F04 $U" "$PROX" "Local F04 $U" 2 '100,00'
E=$(evid c07c); F1=$(foto "$E")
editar c07d "$T/a.jar" "$E" "Valida F04 $U" "$PROX" "Local F04 $U" '1,5' '0,00'
conta c07d 'A lotação precisa ser um número inteiro maior ou igual a 1'
conta c07d 'O preço precisa ser maior que zero'
[ "$F1" = "$(foto "$E")" ] && echo inalterado || echo ALTERADO
```

Esperado:
- Exatamente duas linhas: `lotacao=0 | 422 | 1` e `lotacao=1,5 | 422 | 1`.
- `c07b`: `422` e nenhuma outra linha; `1`.
- Consulta: `0` (nenhum dos eventos inválidos foi criado).
- `c07c`: `302` e [evento]; `c07d`: `422` e nenhuma outra linha; `1`; `1`; `inalterado`.

#### C08 — `Publicar` muda o rascunho para `Publicado`

```bash
. /tmp/catraca-f04/aux.sh
N="Publicar F04 $U"
criar c08a "$T/a.jar" "$N" "$PROX" "Local F04 $U" 2 '100,00'
E=$(evid c08a)
req c08b -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$E/publicar"
req c08c -b "$T/a.jar" "$WEB/organizador/eventos/$E?ok=publicado"
tem c08c 'Evento publicado' '<p>Status: <strong data-status="publicado">Publicado</strong></p>' "<form method=\"post\" action=\"/organizador/eventos/$E/editar\">" "<form method=\"get\" action=\"/organizador/eventos/$E/cancelar\"><button type=\"submit\">Cancelar evento</button></form>"
naotem c08c '<button type="submit">Publicar</button>' "/organizador/eventos/$E/publicar"
req c08d -b "$T/a.jar" "$WEB/organizador"
tem c08d "<tr><td><a href=\"/organizador/eventos/$E\">$N</a></td><td>$PROX_BR</td><td>Publicado</td></tr>"
sql "SELECT status, published_at IS NOT NULL, cancelled_at IS NULL FROM events WHERE id = '$E'"
F1=$(foto "$E")
req c08e -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$E/publicar"
conta c08e 'Este evento já está publicado'
[ "$F1" = "$(foto "$E")" ] && echo inalterado || echo ALTERADO
```

Esperado:
- `c08a`: `302` e [evento]; `c08b`: `302` e `location: /organizador/eventos/<E>?ok=publicado`.
- `c08c`: `200` e nenhuma outra linha; quatro `ok:` e dois `ausente:`.
- `c08d`: `200` e nenhuma outra linha; `ok:`.
- Consulta: `publicado|t|t`.
- `c08e`: `409` e nenhuma outra linha; `1`; `inalterado`.

#### C09 — Publicado sem compras aceita preço R$ 150,00 e lotação 3

```bash
. /tmp/catraca-f04/aux.sh
N="Editar Publicado F04 $U"
criar c09a "$T/a.jar" "$N" "$PROX" "Local F04 $U" 2 '100,00'
E=$(evid c09a)
req c09b -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$E/publicar"
editar c09c "$T/a.jar" "$E" "$N" "$PROX" "Local F04 $U" 3 '150,00'
req c09d -b "$T/a.jar" "$WEB/organizador/eventos/$E?ok=atualizado"
tem c09d 'Evento atualizado' '<dt>Preço</dt><dd>R$ 150,00</dd>' '<dt>Lotação</dt><dd>3</dd>' '<strong data-status="publicado">Publicado</strong>' 'value="150,00"' 'value="3"'
sql "SELECT status, capacity, price_cents FROM events WHERE id = '$E'"
editar c09e "$T/a.jar" "$E" "$N" "$PROX" "Local F04 $U" 1 '150,00'
sql "SELECT capacity FROM events WHERE id = '$E'"
```

Esperado:
- `c09a`: `302` e [evento]; `c09b`: `302` e `location: /organizador/eventos/<E>?ok=publicado`.
- `c09c`: `302` e `location: /organizador/eventos/<E>?ok=atualizado`.
- `c09d`: `200` e nenhuma outra linha; seis `ok:`.
- Consulta: `publicado|3|15000`.
- `c09e`: `302` e `location: /organizador/eventos/<E>?ok=atualizado` (sem compras, as vagas ocupadas são 0); consulta: `1`.

#### C10 — Cancelar pede confirmação e muda para `Cancelado` sem formulários

```bash
. /tmp/catraca-f04/aux.sh
N="Cancelar F04 $U"
criar c10a "$T/a.jar" "$N" "$PROX" "Local F04 $U" 2 '100,00'
E=$(evid c10a)
req c10b -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$E/publicar"
req c10c -b "$T/a.jar" "$WEB/organizador/eventos/$E"
tem c10c "<form method=\"get\" action=\"/organizador/eventos/$E/cancelar\"><button type=\"submit\">Cancelar evento</button></form>"
req c10d -b "$T/a.jar" "$WEB/organizador/eventos/$E/cancelar"
tem c10d '<h1>Cancelar evento</h1>' 'Cancelar é irreversível. Confirmar?' "<form method=\"post\" action=\"/organizador/eventos/$E/cancelar\"><input type=\"hidden\" name=\"confirmar\" value=\"sim\"><button type=\"submit\">Confirmar cancelamento</button></form>"
req c10e -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$E/cancelar"
conta c10e 'Cancelar é irreversível. Confirmar?'
sql "SELECT status, cancelled_at IS NULL FROM events WHERE id = '$E'"
req c10f -b "$T/a.jar" --data-urlencode 'confirmar=sim' "$WEB/organizador/eventos/$E/cancelar"
req c10g -b "$T/a.jar" "$WEB/organizador/eventos/$E?ok=cancelado"
tem c10g 'Evento cancelado com sucesso' "<h1>$N</h1>" '<p>Status: <strong data-status="cancelado">Cancelado</strong></p>'
naotem c10g "/organizador/eventos/$E/editar" "/organizador/eventos/$E/publicar" "/organizador/eventos/$E/cancelar" 'Salvar alterações' '<button type="submit">Publicar</button>' 'Cancelar evento'
req c10h -b "$T/a.jar" "$WEB/organizador"
tem c10h "<tr><td><a href=\"/organizador/eventos/$E\">$N</a></td><td>$PROX_BR</td><td>Cancelado</td></tr>"
sql "SELECT status, published_at IS NOT NULL, cancelled_at IS NOT NULL FROM events WHERE id = '$E'"
```

Esperado:
- `c10a`: `302` e [evento]; `c10b`: `302` e `location: /organizador/eventos/<E>?ok=publicado`.
- `c10c`: `200` e nenhuma outra linha; `ok:` (o publicado oferece `Cancelar evento`).
- `c10d`: `200` e nenhuma outra linha; três `ok:` (página de confirmação).
- `c10e` (POST sem confirmar): `200` e nenhuma outra linha; `1`; consulta: `publicado|t` (nada mudou).
- `c10f`: `302` e `location: /organizador/eventos/<E>?ok=cancelado`.
- `c10g`: `200` e nenhuma outra linha; três `ok:` e seis `ausente:` (nenhum formulário de edição, publicação ou cancelamento).
- `c10h`: `200` e nenhuma outra linha; `ok:`.
- Consulta: `cancelado|t|t`.

#### C11 — Evento cancelado: `POST`s diretos de edição, publicação e cancelamento rejeitados

```bash
. /tmp/catraca-f04/aux.sh
criar c11a "$T/a.jar" "Cancelado F04 $U" "$PROX" "Local F04 $U" 2 '100,00'
E=$(evid c11a)
req c11b -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$E/publicar"
req c11c -b "$T/a.jar" --data-urlencode 'confirmar=sim' "$WEB/organizador/eventos/$E/cancelar"
F1=$(foto "$E")
editar c11d "$T/a.jar" "$E" "Novo nome F04 $U" "$DEPOIS" "Outro local F04 $U" 5 '200,00'
req c11e -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$E/publicar"
req c11f -b "$T/a.jar" --data-urlencode 'confirmar=sim' "$WEB/organizador/eventos/$E/cancelar"
req c11g -b "$T/a.jar" "$WEB/organizador/eventos/$E/cancelar"
for i in c11d c11e c11f c11g; do echo "$i $(conta $i 'Este evento foi cancelado e não pode mais ser alterado') $(conta $i 'Salvar alterações')"; done
[ "$F1" = "$(foto "$E")" ] && echo inalterado || echo ALTERADO
sql "SELECT status, name FROM events WHERE id = '$E'"
```

Esperado:
- `c11a`: `302` e [evento]; `c11b`: `302` e `location: /organizador/eventos/<E>?ok=publicado`; `c11c`: `302` e `location: /organizador/eventos/<E>?ok=cancelado`.
- `c11d`, `c11e`, `c11f`, `c11g`: `409` e nenhuma outra linha, cada um.
- O laço imprime exatamente `c11d 1 0`, `c11e 1 0`, `c11f 1 0`, `c11g 1 0` (a mensagem aparece uma vez e não há formulário de edição).
- `inalterado`; consulta: `cancelado|Cancelado F04 <U>`.

#### C12 — Rascunho não oferece cancelar e `POST` de cancelamento é rejeitado

```bash
. /tmp/catraca-f04/aux.sh
criar c12a "$T/a.jar" "Rascunho F04 $U" "$PROX" "Local F04 $U" 2 '100,00'
E=$(evid c12a)
req c12b -b "$T/a.jar" "$WEB/organizador/eventos/$E"
tem c12b '<strong data-status="rascunho">Rascunho</strong>' '<button type="submit">Publicar</button>'
naotem c12b 'Cancelar evento' "/organizador/eventos/$E/cancelar"
F1=$(foto "$E")
req c12c -b "$T/a.jar" --data-urlencode 'confirmar=sim' "$WEB/organizador/eventos/$E/cancelar"
req c12d -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$E/cancelar"
req c12e -b "$T/a.jar" "$WEB/organizador/eventos/$E/cancelar"
for i in c12c c12d c12e; do echo "$i $(conta $i 'Só evento publicado pode ser cancelado') $(conta $i 'Cancelar é irreversível')"; done
[ "$F1" = "$(foto "$E")" ] && echo inalterado || echo ALTERADO
```

Esperado:
- `c12a`: `302` e [evento]; `c12b`: `200` e nenhuma outra linha; dois `ok:` e dois `ausente:`.
- `c12c`, `c12d`, `c12e`: `409` e nenhuma outra linha, cada um.
- O laço imprime exatamente `c12c 1 0`, `c12d 1 0`, `c12e 1 0`.
- `inalterado` (continua `rascunho`).

#### C13 — Organizador B não vê nem opera eventos de A (lista e URL direta)

```bash
. /tmp/catraca-f04/aux.sh
criar c13a "$T/a.jar" "Rascunho de A F04 $U" "$PROX" "Local secreto A $U" 7 '77,00'
EA1=$(evid c13a)
criar c13b "$T/a.jar" "Publicado de A F04 $U" "$PROX" "Local secreto A $U" 7 '77,00'
EA2=$(evid c13b)
req c13c -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$EA2/publicar"
criar c13d "$T/b.jar" "Evento de B F04 $U" "$DEPOIS" "Local de B $U" 3 '20,00'
EB=$(evid c13d)
FA1=$(foto "$EA1"); FA2=$(foto "$EA2")
req c13e -b "$T/b.jar" "$WEB/organizador"
tem c13e "<a href=\"/organizador/eventos/$EB\">Evento de B F04 $U</a>"
naotem c13e "$EA1" "$EA2" "de A F04 $U" "Local secreto A"
i=0
for p in evt_0000000000000000 "$EA1" "$EA2" "$EA2/cancelar" nao-e-um-id; do
  i=$((i + 1))
  printf '%s | %s| %s | %s\n' "$p" "$(req c13f$i -b "$T/b.jar" "$WEB/organizador/eventos/$p" | tr '\n' ' ')" "$(conta c13f$i '<h1>Evento não encontrado</h1>')" "$(grep -cE "de A F04|Local secreto A|R\\\$ 77,00|<dd>7</dd>|$EA1|$EA2" "$T/c13f$i.html")"
done
for i in 2 3 4 5; do cmp -s "$T/c13f1.html" "$T/c13f$i.html" && echo "igual: $i" || echo "DIFERENTE: $i"; done
editar c13g "$T/b.jar" "$EA2" "Invadido F04 $U" "$DEPOIS" "Local de B $U" 9 '1,00'
editar c13h "$T/b.jar" "$EA1" "Invadido F04 $U" "$DEPOIS" "Local de B $U" 9 '1,00'
req c13i -b "$T/b.jar" -X POST "$WEB/organizador/eventos/$EA1/publicar"
req c13j -b "$T/b.jar" --data-urlencode 'confirmar=sim' "$WEB/organizador/eventos/$EA2/cancelar"
for i in c13g c13h c13i c13j; do echo "$i $(conta $i '<h1>Evento não encontrado</h1>') $(grep -cE 'de A F04|Local secreto A' "$T/$i.html")"; done
[ "$FA1" = "$(foto "$EA1")" ] && echo "EA1 inalterado" || echo "EA1 ALTERADO"
[ "$FA2" = "$(foto "$EA2")" ] && echo "EA2 inalterado" || echo "EA2 ALTERADO"
sql "SELECT count(*) FROM events WHERE name = 'Invadido F04 $U'"
req c13k -b "$T/a.jar" "$WEB/organizador"
tem c13k "<a href=\"/organizador/eventos/$EA1\">Rascunho de A F04 $U</a>" "<a href=\"/organizador/eventos/$EA2\">Publicado de A F04 $U</a>"
naotem c13k "$EB" "Evento de B F04 $U"
req c13l -b "$T/a.jar" "$WEB/organizador/eventos/$EB"
conta c13l '<h1>Evento não encontrado</h1>'
```

Esperado:
- `c13a`, `c13b`, `c13d`: `302` e [evento]; `c13c`: `302` e `location: /organizador/eventos/<EA2>?ok=publicado`.
- `c13e`: `200` e nenhuma outra linha; `ok:` (B vê o próprio evento) e quatro `ausente:` (nem id, nem nome, nem local dos eventos de A).
- O primeiro laço imprime exatamente 5 linhas no formato `<caminho> | 404 | 1 | 0` (inexistente, rascunho de A, publicado de A, confirmação de cancelamento do publicado de A e id inválido: status `404` sem `location` nem `set-cookie`, a página `Evento não encontrado` e nenhum nome, local, preço, lotação ou id de evento de A).
- O segundo laço imprime `igual: 2`, `igual: 3`, `igual: 4`, `igual: 5` (o `404` de evento de A é idêntico, byte a byte, ao de evento inexistente e ao de id inválido).
- `c13g`, `c13h`, `c13i`, `c13j`: `404` e nenhuma outra linha, cada um; o laço imprime exatamente `c13g 1 0`, `c13h 1 0`, `c13i 1 0`, `c13j 1 0`.
- `EA1 inalterado`, `EA2 inalterado`; consulta: `0`.
- `c13k`: `200` e nenhuma outra linha; dois `ok:` e dois `ausente:` (A vê os próprios eventos e não vê o de B).
- `c13l`: `404` e nenhuma outra linha; `1`.

#### C14 — Visitante não acessa a gestão de eventos

```bash
. /tmp/catraca-f04/aux.sh
criar c14a "$T/a.jar" "Visitante F04 $U" "$PROX" "Local F04 $U" 2 '100,00'
E=$(evid c14a)
req c14b -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$E/publicar"
F1=$(foto "$E")
for p in /organizador /organizador/eventos/novo "/organizador/eventos/$E" "/organizador/eventos/$E/cancelar"; do printf '%s ' "$p"; req c14 "$WEB$p" | tr '\n' ' '; echo; done
criar c14c /dev/null "Criado por visitante F04 $U" "$PROX" "Local F04 $U" 2 '100,00'
editar c14d /dev/null "$E" "Editado por visitante F04 $U" "$PROX" "Local F04 $U" 9 '1,00'
req c14e -X POST "$WEB/organizador/eventos/$E/publicar"
req c14f --data-urlencode 'confirmar=sim' "$WEB/organizador/eventos/$E/cancelar"
sql "SELECT count(*) FROM events WHERE name LIKE '% por visitante F04 $U'"
[ "$F1" = "$(foto "$E")" ] && echo inalterado || echo ALTERADO
```

Esperado:
- `c14a`: `302` e [evento]; `c14b`: `302` e `location: /organizador/eventos/<E>?ok=publicado`.
- O laço imprime exatamente 4 linhas, cada uma com o caminho seguido de `302 location: /entrar` (e nada mais).
- `c14c`, `c14d`, `c14e`, `c14f`: `302` e `location: /entrar` (nenhuma outra linha), cada um.
- Consulta: `0`; `inalterado` (o evento continua `publicado`, com os mesmos dados).

#### C15 — Participante não acessa a gestão de eventos

```bash
. /tmp/catraca-f04/aux.sh
N="Oculto do participante F04 $U"
criar c15a "$T/a.jar" "$N" "$PROX" "Local F04 $U" 2 '100,00'
E=$(evid c15a)
req c15b -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$E/publicar"
F1=$(foto "$E")
for p in /organizador /organizador/eventos/novo "/organizador/eventos/$E" "/organizador/eventos/$E/cancelar"; do
  printf '%s | %s| %s | %s\n' "$p" "$(req c15 -b "$T/p.jar" "$WEB$p" | tr '\n' ' ')" "$(conta c15 '<h1>Acesso negado</h1>')" "$(conta c15 'Oculto do participante')"
done
criar c15c "$T/p.jar" "Criado por participante F04 $U" "$PROX" "Local F04 $U" 2 '100,00'
editar c15d "$T/p.jar" "$E" "Editado por participante F04 $U" "$PROX" "Local F04 $U" 9 '1,00'
req c15e -b "$T/p.jar" -X POST "$WEB/organizador/eventos/$E/publicar"
req c15f -b "$T/p.jar" --data-urlencode 'confirmar=sim' "$WEB/organizador/eventos/$E/cancelar"
for i in c15c c15d c15e c15f; do echo "$i $(conta $i '<h1>Acesso negado</h1>') $(conta $i 'Oculto do participante')"; done
sql "SELECT count(*) FROM events WHERE name LIKE '% por participante F04 $U'"
[ "$F1" = "$(foto "$E")" ] && echo inalterado || echo ALTERADO
```

Esperado:
- `c15a`: `302` e [evento]; `c15b`: `302` e `location: /organizador/eventos/<E>?ok=publicado`.
- O primeiro laço imprime exatamente 4 linhas no formato `<caminho> | 403 | 1 | 0` (status `403` sem `location` nem `set-cookie`, página `Acesso negado`, nenhum dado do evento).
- `c15c`, `c15d`, `c15e`, `c15f`: `403` e nenhuma outra linha, cada um; o laço imprime exatamente `c15c 1 0`, `c15d 1 0`, `c15e 1 0`, `c15f 1 0`.
- Consulta: `0`; `inalterado`.

### Encerramento (depois do C15)

```bash
rm -rf /tmp/catraca-f04
```

Sem veredito. O `npm run down` final é feito pela skill de avaliação.

### 2.2 Roteiro opcional no navegador (sem veredito)

Complementa os itens acima para quem quiser ver as telas; não substitui nenhum item.

1. Entrar em `$WEB/entrar` com `organizador.a@catraca.test` / `catraca123`: abre `Área do organizador`.
2. Clicar em `Novo evento`, preencher Nome, Data e hora de início (dia 15 do mês seguinte, `21:00`, no formato `DD/MM/AAAA HH:MM`), Local, Lotação `2` e Preço `100,00`, e clicar em `Salvar`: a página de gestão mostra `Evento criado` e o status `Rascunho`.
3. Clicar em `Publicar`: `Evento publicado`, status `Publicado` e o botão `Cancelar evento`.
4. No formulário de edição, mudar o preço para `150,00` e a lotação para `3` e clicar em `Salvar alterações`: `Evento atualizado` e os novos valores.
5. Clicar em `Cancelar evento`: aparece `Cancelar é irreversível. Confirmar?`; clicar em `Confirmar cancelamento`: `Evento cancelado com sucesso`, status `Cancelado` e nenhum formulário.
6. Copiar o endereço da página, sair, entrar com `organizador.b@catraca.test` e abrir o endereço: `Evento não encontrado`, sem dados do evento.

## 3. Mapeamento critério → itens

| Critério (PRD) | Itens |
|----------------|-------|
| F04-CA01 | C02, C03, C04 |
| F04-CA02 | C05, C06 |
| F04-CA03 | C07 |
| F04-CA04 | C08 |
| F04-CA05 | C09 |
| F04-CA06 | C10, C11 |
| F04-CA07 | C12 |
| F04-CA08 | C13 |
| CF03 (F02 → F04) | C13, C14, C15 |
| F01 — capacidade "A seed não cria eventos" (pendência registrada na seção 4 do contrato da F01) | C01 |

Notas do mapeamento:
- C03 verifica a Experiência 1 e 2 do PRD (lista com `Novo evento` e o formulário com os cinco campos) que levam ao F04-CA01; C04 verifica a capacidade "preço em reais, até 2 casas, guardado em centavos" e a leitura da data no fuso do produto (`America/Sao_Paulo`, -03:00) que o F04-CA01 pressupõe ("data e hora no mês seguinte", "R$ 100,00").
- C09 também mostra que, sem compras, a lotação pode descer até 1 (vagas ocupadas = 0); a recusa de lotação abaixo das vagas ocupadas com compras reais é do CF05, no contrato da F05.
- C11 cobre os "`POST` direto de edição ou publicação" do F04-CA06 e também o novo cancelamento e a página de confirmação ("não pode ser editado, publicado de novo nem cancelado outra vez", PRD F04 Capacidades).
- C13 cobre o F04-CA08 e a parte "organizador B não vê nem opera os eventos de A, nem pela lista nem pela URL direta" do CF03; C14 e C15 cobrem "visitante é redirecionado para `/entrar`, participante recebe `Acesso negado`" do CF03 nas rotas da gestão de eventos (com evento real de A).
- C01 fecha a pendência deixada pelo contrato da F01 (a tabela de eventos só existe a partir da F04); não corresponde a um critério da F04.

## 4. Fora deste contrato

- **CF05 (F04 → F05)** — rascunho recusado na compra, preço vigente gravado na compra, lotação abaixo das vagas ocupadas (com compras reais) rejeitada com `A lotação não pode ficar menor que as vagas ocupadas`: contrato da F05, a consumidora (que registra o provedor de vagas ocupadas).
- **CF06 (F04 → F05)** — cancelamento do evento levando ingressos a `refunded`/`cancelled` em até 10 s: contrato da F05 (tratador de "evento cancelado").
- **CF08 (F04 → F06)** e **CF10 (F04 → F07)** — rascunho fora e publicado dentro da vitrine e da API, cancelado saindo das duas, `priceCents` igual ao preço vigente: contratos da F06 e da F07. Antes delas, "eventos à venda" não tem superfície HTTP; a consulta é coberta pelos testes automatizados da F04 (`consultas.test.ts`, executados no `G1`).
- **CF14 (F04 → F08)** e **CF16 (F04 → F09)** — seções de check-in e painel na página de gestão, só para o dono: contratos da F08 e da F09. Os pontos de extensão (seções, `renderManagementPage`, `requireOwnedEvent` em rotas acrescentadas, provedor de vagas, tratadores de cancelamento na mesma transação) são verificados pelos testes automatizados da F04 (`extensoes.test.ts`, `edicao.test.ts`, `cancelamento.test.ts`, `isolamento.test.ts`), executados pelos gates (`G1` da skill de avaliação).
- Login, sessão, navegação (`Área do organizador` no topo) e a proteção genérica de `/organizador`: F02 (contrato da F02, C13–C16).
- Exclusão, duplicação e eventos recorrentes; cancelamento de rascunho (só a recusa, C12): fora de escopo do PRD.

## 5. Alterações do contrato

Nenhuma.
