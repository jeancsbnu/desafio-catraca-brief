# Contrato: F08 — Check-in

## 1. Pré-requisitos de ambiente

- **Commit avaliado:** o avaliador registra o hash no relatório (`git rev-parse HEAD` na raiz do repositório avaliado — `main`, branch ou worktree da F08).
- **Onde roda:** na raiz da pasta do repositório avaliado, num shell `bash` (Linux, macOS ou WSL). Cada bloco do roteiro começa com `. /tmp/catraca-f08/aux.sh` (criado na Preparação), que entra na raiz do repositório e define variáveis e funções; por isso os blocos podem rodar em shells separados.
- **Subir:** `npm run up` · **Derrubar:** `npm run down` · **Gates:** `npm run gates` (comandos do `AGENTS.md`; nenhum `npm install`). Conforme a skill `evaluate-feature`, o avaliador roda `npm run down` e `npm run up` antes da Preparação.
- **Endereços:** `$WEB` = `$API` = `http://localhost:3000`; se a pasta avaliada tiver um `.env` com `CATRACA_PORT`, a Preparação usa essa porta (nenhum resultado esperado muda: os `location` são caminhos relativos). **Chave de parceiro:** `parceiro-catraca-dev` (README); não é usada neste contrato — a API de parceiros é da F07.
- **Contas da seed:** organizador A (`organizador.a@catraca.test`), organizador B (`organizador.b@catraca.test`), participante (`participante@catraca.test`); senha `catraca123` para as três, conforme o README (seção "Credenciais"). O organizador A cria, publica e cancela eventos e faz os check-ins; o organizador B tem eventos próprios e é o "outro organizador" do isolamento; o participante compra pelo canal `vitrine` (`--conta`) e é o participante barrado na área do organizador.
- **Modo:** padrão — gateway simulado com os **tempos reais do brief** (`…0001`/`…0002` em 2–5 s, `…0003`/`…0004` em 30–40 s). Nenhuma variável `GATEWAY_*` no shell nem no `.env`; um `.env` local só é aceito com `CATRACA_PORT` e/ou `COMPOSE_PROJECT_NAME` (conferido na Preparação).
- **Superfícies usadas:** só as de F01–F05 e a da própria F08: `POST /entrar` e `POST /cadastro` (F02); criação, publicação, cancelamento e página de gestão de eventos (F04, com os cookies dos organizadores); os comandos `catraca compra:simular` (com `--conta` = canal `vitrine`, com `--email` = canal `api`) e `catraca ingresso:consultar` (F05, dentro do container `app`); a seção "Check-in" e `POST /organizador/eventos/{id}/checkin` (F08); consultas SQL **só de leitura** no container `db`; os logs do container `app`; o `npm run gates`. Nenhum item usa vitrine, API de parceiros ou painel (features da mesma wave ou posteriores).
- **Como medir tempo:** as esperas usam o relógio do banco: a função `idade` espera o ingresso completar N segundos desde `tickets.created_at` e então mostra o status naquele instante. Assim, "confirmado em até 5 s" (`…0001`) é conferido aos 6 s, e "pendente até 30 s" (`…0003`/`…0004`) é conferido antes dos 30 s.
- **Ferramentas do avaliador:** `bash`, `git`, `curl`, `awk`, `sed`, `grep`, `sort`, `uniq`, `paste`, `cut`, `tr`, `wc`, `xargs`, `cmp`, `docker` com Compose v2, `node` (LTS), `npm`.
- **Datas:** a Preparação calcula `PROX` = dia 15 do mês seguinte, 21:00 (`AAAA-MM-DDTHH:MM`, fuso `America/Sao_Paulo`), usada em todos os eventos.
- **Ordem e dados:** os itens rodam na ordem numérica. Cada item cria os próprios eventos (função `evento`, nomes `Evento F08 <U>-<n>`, sufixo `$U` único por avaliação) e as próprias compras, e não depende de outro item. Dados criados: eventos dos organizadores A e B (publicados, um rascunho, alguns cancelados), ingressos e tentativas de pagamento, marcações de check-in e, no C09, uma conta de participante `participante.f08.<U>@example.com`. Nenhuma escrita fora das superfícies do produto.
- **Duração:** cerca de 5 minutos para C01–C09 (C03 espera até 41 s e C09 até 46 s), mais o C10, que constrói a imagem dos gates e pode levar alguns minutos — use um tempo-limite de pelo menos 10 minutos para esse comando.

### Preparação (antes do C01)

```bash
# na raiz do repositório avaliado, com o ambiente já subido por npm run up
git status --porcelain | wc -l
git rev-parse HEAD
env | grep -c '^GATEWAY_'
if [ -e .env ]; then grep -vE '^[[:space:]]*(#|$)' .env | grep -cvE '^(CATRACA_PORT|COMPOSE_PROJECT_NAME)='; else echo "sem .env"; fi
mkdir -p /tmp/catraca-f08 && rm -rf /tmp/catraca-f08/*
printf "cd '%s'\n" "$(git rev-parse --show-toplevel)" > /tmp/catraca-f08/aux.sh
printf 'U=%s\n' "$(date +%s)" >> /tmp/catraca-f08/aux.sh
TZ=America/Sao_Paulo node -e '
const p = (n) => String(n).padStart(2, "0");
const h = new Date();
const a = new Date(h.getFullYear(), h.getMonth() + 1, 15);
console.log(`PROX=${a.getFullYear()}-${p(a.getMonth() + 1)}-${p(a.getDate())}T21:00`);
' >> /tmp/catraca-f08/aux.sh
cat >> /tmp/catraca-f08/aux.sh <<'EOF'
T=/tmp/catraca-f08
PORTA=${CATRACA_PORT:-$(sed -n 's/^CATRACA_PORT=//p' .env 2>/dev/null | tail -n 1)}
WEB=http://localhost:${PORTA:-3000}
# req <id> [opções do curl] <url>: imprime o status HTTP e as linhas location/set-cookie; corpo em $T/<id>.html
req() { _id=$1; shift; curl -s -o "$T/$_id.html" -D "$T/$_id.h" -w '%{http_code}\n' "$@"; tr -d '\r' < "$T/$_id.h" | awk '{ i = index($0, ":"); n = tolower(substr($0, 1, i - 1)); if (n == "location" || n == "set-cookie") print n ":" substr($0, i + 1) }'; }
# conta <id> <texto>: ocorrências do texto no corpo guardado
conta() { grep -oF -- "$2" "$T/$1.html" | wc -l | tr -d ' '; }
# tem / naotem <id> <texto>...: presença ou ausência de cada texto no corpo guardado
tem() { _id=$1; shift; for s in "$@"; do grep -qF -- "$s" "$T/$_id.html" && echo "ok: $s" || echo "FALTA: $s"; done; }
naotem() { _id=$1; shift; for s in "$@"; do grep -qF -- "$s" "$T/$_id.html" && echo "INDEVIDO: $s" || echo "ausente: $s"; done; }
sql() { docker compose exec -T db psql -U catraca -d catraca -At -c "$1" < /dev/null; }
entrar() { req "$1" -c "$2" -b "$2" --data-urlencode "email=$3" --data-urlencode "senha=catraca123" "$WEB/entrar"; }
# evento <a|b> <lotação> <preço> [rascunho]: cria pela F04 um evento novo do organizador A ou B (e publica, salvo "rascunho"); imprime o id
evento() {
  _k=$(( $(cat "$T/k" 2>/dev/null || echo 0) + 1 )); echo "$_k" > "$T/k"
  _s=$(req "ev$_k" -b "$T/$1.jar" --data-urlencode "nome=Evento F08 $U-$_k" --data-urlencode "inicio=$PROX" --data-urlencode "local=Local F08 $U" --data-urlencode "lotacao=$2" --data-urlencode "preco=$3" "$WEB/organizador/eventos" | head -n 1)
  _e=$(tr -d '\r' < "$T/ev$_k.h" | sed -n 's|^[Ll]ocation: /organizador/eventos/\(evt_[a-z0-9]\{16\}\)?ok=criado$|\1|p')
  if [ "$_s" != 302 ] || [ -z "$_e" ]; then echo "FALHA: criar evento respondeu $_s" >&2; return 1; fi
  if [ "${4-}" != rascunho ]; then
    _s=$(req "pu$_k" -b "$T/$1.jar" -X POST "$WEB/organizador/eventos/$_e/publicar" | head -n 1)
    if [ "$_s" != 302 ]; then echo "FALHA: publicar respondeu $_s" >&2; return 1; fi
  fi
  echo "$_e"
}
# nome <evento>: nome do evento
nome() { sql "SELECT name FROM events WHERE id = '$1'"; }
# cancelar <id> <evento>: cancelamento confirmado pela F04, como organizador A
cancelar() { req "$1" -b "$T/a.jar" --data-urlencode 'confirmar=sim' "$WEB/organizador/eventos/$2/cancelar"; }
compra() { docker compose exec -T app catraca compra:simular "$@" < /dev/null; }
consultar() { docker compose exec -T app catraca ingresso:consultar "$@" < /dev/null; }
# tkt / cod <arquivo> [n]: n-ésimo id de ingresso / código de ingresso que aparece na saída da compra:simular
tkt() { grep -oE 'tkt_[a-z0-9]{16}' "$1" | sed -n "${2:-1}p"; }
cod() { grep -oE 'código [A-Z0-9]{8}' "$1" | sed -n "${2:-1}p" | cut -d' ' -f2; }
# idade <tkt> <s>: espera o ingresso completar <s> segundos desde a criação (relógio do banco) e imprime status|idade
idade() { _r=$(sql "SELECT greatest(0, $2 - EXTRACT(EPOCH FROM clock_timestamp() - created_at)) FROM tickets WHERE id = '$1'"); sleep "${_r:-0}"; sql "SELECT status, round(EXTRACT(EPOCH FROM clock_timestamp() - created_at)::numeric, 1) FROM tickets WHERE id = '$1'"; }
# ci <tkt>: linhas "status:" e "check-in:" do ingresso:consultar, unidas por "|"
ci() { consultar "$1" | grep -E '^(status|check-in): ' | paste -sd '|' -; }
# marca <tkt>: status|checked_in|checked_in_at (microssegundos) do ingresso, lidos no banco
marca() { sql "SELECT status, checked_in, coalesce(to_char(checked_in_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.US'), '-') FROM tickets WHERE id = '$1'"; }
# resultado <id>: texto do(s) elemento(s) de resultado do check-in no corpo guardado (separados por ";")
resultado() { grep -oE 'data-checkin-resultado="[a-z_]+">[^<]*</p>' "$T/$1.html" | sed -E 's/^[^>]*>//; s/<\/p>$//' | paste -sd ';' -; }
# checkin <id> <a|b|p|-> <evento> <código>: POST /organizador/eventos/<evento>/checkin com codigo=<código>, com o cookie
# do organizador A (a), do organizador B (b), do participante (p) ou sem cookie (-). Imprime uma linha:
# "<status>[ <location/set-cookie>] | <resultado, ou -> | <vezes que >resultado< aparece na página> | campo=<value do campo Código, ou ausente>"
checkin() {
  if [ "$2" = - ]; then _j=/dev/null; else _j="$T/$2.jar"; fi
  _h=$(req "$1" -b "$_j" --data-urlencode "codigo=$4" "$WEB/organizador/eventos/$3/checkin" | paste -sd ' ' -)
  _m=$(resultado "$1"); _n=0
  if [ -n "$_m" ]; then _n=$(grep -oF -- ">$_m<" "$T/$1.html" | wc -l | tr -d ' '); else _m=-; fi
  _i=$(grep -oE '<input [^>]*name="codigo"[^>]*>' "$T/$1.html")
  if [ -z "$_i" ]; then _v=ausente; else _v=$(printf '%s\n' "$_i" | sed -E 's/.* value="([^"]*)".*/"\1"/' | paste -sd ';' -); fi
  echo "$_h | $_m | $_n | campo=$_v"
}
# minusc <texto>: o texto em minúsculas
minusc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
EOF
. /tmp/catraca-f08/aux.sh
sed -n '2,3p' /tmp/catraca-f08/aux.sh
curl -s -w '\n%{http_code}\n' "$WEB/health"
sql "SELECT to_regclass('public.events') IS NOT NULL, to_regclass('public.tickets') IS NOT NULL, to_regclass('public.payment_attempts') IS NOT NULL"
docker compose exec -T app catraca help < /dev/null | grep -cE '^  (compra:simular|ingresso:consultar) '
docker compose logs --no-log-prefix app | grep -F '[catraca] módulos:' | tail -n 1 | sed 's/.*módulos: //' | tr ',' '\n' | sed 's/^ *//' | grep -xE 'eventos|ingressos|checkin' | paste -sd ' ' -
docker compose logs --no-log-prefix app | grep -F '"msg":"gateway: worker iniciado"' | tail -n 1 | grep -cE '"escala":1[,}]'
entrar pa "$T/a.jar" organizador.a@catraca.test
entrar pb "$T/b.jar" organizador.b@catraca.test
entrar pp "$T/p.jar" participante@catraca.test
```

Esperado:
- `0` (árvore limpa); o hash do commit; `0` (nenhuma variável `GATEWAY_*` no shell); `sem .env` ou `0` (o `.env` só tem `CATRACA_PORT`/`COMPOSE_PROJECT_NAME`).
- Duas linhas: `U=<número>` e `PROX=<AAAA-MM>-15T21:00` (mês seguinte ao atual).
- `{"status":"ok"}` e `200`.
- `t|t|t` (as tabelas de eventos, ingressos e tentativas de pagamento existem).
- `2` (o `help` lista `compra:simular` e `ingresso:consultar`).
- Exatamente `eventos ingressos checkin` (o módulo da F08 carrega depois dos módulos de eventos e de ingressos).
- `1` (o worker do gateway está no ar com escala 1, os tempos do brief).
- `pa` e `pb`: `302`, `location: /organizador` e uma linha `set-cookie: catraca_sessao=…`; `pp`: `302`, `location: /` e uma linha `set-cookie: catraca_sessao=…`.

Sem isso, o contrato não é executável.

**Convenções dos resultados esperados:**
- A saída de `req` (e de `cancelar`) é o status na primeira linha e, depois, as linhas `location:`/`set-cookie:`. "Nenhuma outra linha" quer dizer que a resposta não tem `location` nem `set-cookie`.
- A saída de `checkin` é **uma linha** `<status>[ <location/set-cookie>] | <resultado> | <n> | campo=<valor>`: `<resultado>` é o texto do elemento de resultado do check-in (`-` quando a página não tem nenhum); `<n>` é quantas vezes `>resultado<` aparece na página inteira (`1` = a mensagem aparece uma única vez); `campo=""` = a página tem o campo `Código` e ele está vazio; `campo=ausente` = a página não tem o campo. Exemplo: `200 | Entrada liberada | 1 | campo=""`.
- A saída de `ci` é `status: <valor> (<rótulo>)|check-in: <não ou sim em …>` (linhas do `ingresso:consultar` da F05). **[sim]** = `check-in: sim em <AAAA-MM-DD>T<HH:MM:SS>-03:00`.
- A saída de `idade` é `<status>|<segundos de vida do ingresso, com ponto>`.
- `evento` imprime só o id `evt_<16 caracteres [a-z0-9]>`; se imprimir `FALHA: …`, a superfície da F04 falhou e o item é ✗ `não executável`.
- `<E>`, `<K>`, `<C>`, `<U>` etc. indicam o valor da variável no momento da execução; `<x>` é um número conferido pela faixa indicada.
- Linhas da `compra:simular` (F05): `simulando <N> compra(s) simultânea(s) no evento <E> pelo canal <api|vitrine>`, `compra <i>/<N>: criada <tkt> código <CÓDIGO> status pending valor <centavos> em <S> s`, `resumo: criadas <a>, sold_out <b>, event_not_available <c>, invalid_request <d>, erros <e>`.

## 2. Itens verificáveis

A tabela é o índice. Os comandos exatos e o resultado completo de cada item estão no roteiro 2.1, que prevalece sobre o resumo.

| ID | Item | Tipo | Como verificar (resumo) | Resultado esperado (resumo) | Regras |
|----|------|------|-------------------------|-----------------------------|--------|
| C01 | A página de gestão tem a seção "Check-in" (campo `Código`, botão `Validar`) em rascunho, publicado e cancelado | HTTP | Três eventos de A (rascunho, publicado, cancelado pela F04); `GET` da página de gestão; `GET …/checkin` | `200`; seção `checkin` uma vez, depois dos dados do evento, com o formulário `POST …/checkin`, o campo vazio e `Validar`, sem resultado; `…/checkin` por `GET` → `302` para a página de gestão | R04, R10 |
| C02 | Confirmado → `Entrada liberada` e o ingresso passa a ter check-in; de novo → `Ingresso já utilizado`; vitrine e API | TEMPO | Compras `…0001` com `--conta` (vitrine) e `--email` (API); confirmados aos 6 s; dois check-ins de cada código; `ingresso:consultar`; banco | `200 \| Entrada liberada \| 1 \| campo=""` na própria página de gestão, em destaque, com o campo limpo; `check-in: sim em …` e status `confirmed`; depois `Ingresso já utilizado`, marcação inalterada | R09, R10 |
| C03 | Pendente (`…0003`, `…0004`) e recusado (`…0002`) → `Ingresso não confirmado`; o `…0003` confirmado depois → `Entrada liberada` | TEMPO | Três compras; check-ins antes dos 30 s; espera até 41 s; check-ins de novo | `Ingresso não confirmado` nos três, sem marcar; aos 41 s o `…0003` (`confirmed`) libera e o `…0004` (`declined`) continua não confirmado | R10 |
| C04 | `ZZZZZZZZ`, código malformado, código de outro evento de A e de evento de B → `Ingresso inválido para este evento` | TEMPO | Três eventos (dois de A, um de B) com compras `…0001`; sete códigos no check-in do primeiro; check-in de cada código no próprio evento | Sete vezes `Ingresso inválido para este evento`, nenhum ingresso marcado; depois cada código libera no próprio evento | R09, R10 |
| C05 | Código com espaços nas pontas e minúsculas é aceito; em branco → `Informe o código do ingresso` | TEMPO | Duas compras `…0001`; código vazio, só espaços e sem campo; código ` <minúsculas> ` e com caixa misturada | `422 \| Informe o código do ingresso` sem marcar nada; código normalizado libera (`Código conferido: <CÓDIGO>`), maiúsculo de novo → já utilizado | R10 |
| C06 | Evento cancelado: estornado (com e sem check-in), cancelado e recusado → `Evento cancelado`; código de outro evento → inválido; campo continua | TEMPO | Compras `…0001` (vitrine e API), `…0003`, `…0002`; um check-in; cancelar pela F04 antes dos 30 s; página; seis códigos | `refunded`/`cancelled`/`declined`; seção e campo presentes; quatro `Evento cancelado`, dois `Ingresso inválido para este evento`; nada marcado; o ingresso do outro evento libera no próprio evento | R10, R11 |
| C07 | Só o dono opera o check-in: B recebe `404` sem processar o código; participante `403`; visitante `/entrar` | HTTP | Ingresso confirmado de A; B, participante e visitante tentam; B no próprio evento com o código de A; A no fim | B: `404` `Evento não encontrado` (também com código em branco e por `GET`), idêntico ao de evento inexistente; `403`; `302 /entrar`; no evento de B → inválido; ingresso intacto; A → `Entrada liberada` | R04, R10, R13 |
| C08 | Check-ins simultâneos do mesmo código: exatamente um liberado | HTTP + DB | 3 ingressos confirmados; para cada um, 10 `POST`s simultâneos (`xargs -P 10`) | Em cada rodada: 10 × `200`, 1 × `Entrada liberada`, 9 × `Ingresso já utilizado`; 3 ingressos marcados, um instante de marcação por ingresso | R10 |
| C09 | Fluxo do avaliador: passo 10 e a parte de check-in dos passos 11 e 14 | TEMPO | E1 (lotação 2) com C1 (conta nova, `…0001`) e C2 (`…0004`); E2 de B com C3; E3 com C5 (`…0003`) e C6 (`…0001`), cancelado | C1 liberado, de novo já utilizado; C2 não confirmado (pendente e recusado); `ZZZZZZZZ` inválido; B sem acesso; C3 inválido em E1; C6 e C5 → `Evento cancelado` em E3 | R09, R10, R11, R13 |
| C10 | Testes automatizados da F08 passam nos gates | TEST | IDs dos critérios nos testes de `app/test/f08/`; `npm run gates -- test/f08` | Os 9 IDs presentes; `exit=0`; `testes: ok (N executados, 0 falharam)` com N ≥ 30; `resultado: OK` | R10, R11, R13 |

### 2.1 Roteiro detalhado

Todos os comandos rodam a partir da raiz do repositório (o `aux.sh` faz o `cd`).

#### C01 — A página de gestão tem a seção "Check-in" em rascunho, publicado e cancelado

```bash
. /tmp/catraca-f08/aux.sh
R=$(evento a 5 '100,00' rascunho); P=$(evento a 5 '100,00'); X=$(evento a 5 '100,00'); echo "$R $P $X"
cancelar c01x "$X"
for e in "$R" "$P" "$X"; do
  echo "== $(sql "SELECT status FROM events WHERE id = '$e'") $(req "c01-$e" -b "$T/a.jar" "$WEB/organizador/eventos/$e" | paste -sd ' ' -)"
  tem "c01-$e" "<h1>$(nome "$e")</h1>" '<section class="gestao-secao" data-secao="checkin">' '<h2>Check-in</h2>' "<form method=\"post\" action=\"/organizador/eventos/$e/checkin\">" '<label for="codigo">Código</label>' '<input id="codigo" name="codigo" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" value="">' '<button type="submit">Validar</button>'
  naotem "c01-$e" 'data-checkin-resultado' 'autofocus' 'Código conferido'
  echo "seções checkin: $(conta "c01-$e" 'data-secao="checkin"')"
  node -e 'const s = require("fs").readFileSync(process.argv[1], "utf8"); const a = s.indexOf("</dl>"), b = s.indexOf("data-secao=\"checkin\""), c = s.lastIndexOf("Voltar para meus eventos"); console.log(a >= 0 && a < b && b < c ? "posição ok" : "posição ERRADA")' "$T/c01-$e.html"
done
req c01g -b "$T/a.jar" "$WEB/organizador/eventos/$P/checkin"
```

Esperado:
- Três ids `evt_…`; `c01x`: `302` e `location: /organizador/eventos/<X>?ok=cancelado`.
- Para cada evento, nesta ordem, o bloco:
  - `== rascunho 200` (depois `== publicado 200` e `== cancelado 200`: a página responde `200` sem `location` nem `set-cookie`);
  - sete `ok:` (o nome do evento como título, a seção `checkin`, o título `Check-in`, o formulário que envia para `/organizador/eventos/<id>/checkin`, o rótulo `Código`, o campo vazio e o botão `Validar`) e três `ausente:` (nenhum resultado, foco ou código conferido antes de um envio);
  - `seções checkin: 1`;
  - `posição ok` (a seção vem depois dos dados do evento e antes do link de volta da página de gestão).
- `c01g`: `302` e `location: /organizador/eventos/<P>` (o endereço da ação aberto direto leva à página de gestão).

#### C02 — Confirmado → `Entrada liberada`; de novo → `Ingresso já utilizado` (vitrine e API)

```bash
. /tmp/catraca-f08/aux.sh
E=$(evento a 5 '100,00'); echo "$E"
compra --evento "$E" --cartao 4000000000000001 --conta participante@catraca.test > "$T/c02v.txt"; echo "exit=$?"
compra --evento "$E" --cartao 4000000000000001 --email "api.f08.$U@example.com" > "$T/c02a.txt"; echo "exit=$?"
grep -hE '^(simulando|resumo)' "$T/c02v.txt" "$T/c02a.txt" | sed "s/$E/<E>/"
KV=$(tkt "$T/c02v.txt"); CV=$(cod "$T/c02v.txt"); KA=$(tkt "$T/c02a.txt"); CA=$(cod "$T/c02a.txt"); echo "$KV $CV $KA $CA"
idade "$KV" 6; idade "$KA" 6
ci "$KV"; ci "$KA"
checkin c02a a "$E" "$CV"
tem c02a "<h1>$(nome "$E")</h1>" '<strong data-status="publicado">Publicado</strong>' '<section class="gestao-secao" data-secao="checkin">' '<p class="msg msg-success" role="status" data-checkin-resultado="liberada">Entrada liberada</p>' "Código conferido: <strong>$CV</strong>" '<input id="codigo" name="codigo" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" value="" autofocus>'
naotem c02a "value=\"$CV\""
ci "$KV"
M1=$(marca "$KV"); echo "$M1"
checkin c02b a "$E" "$CV"
tem c02b '<p class="msg msg-error" role="alert" data-checkin-resultado="ja_utilizado">Ingresso já utilizado</p>'
[ "$M1" = "$(marca "$KV")" ] && echo "marcação inalterada" || echo "marcação ALTERADA"
checkin c02c a "$E" "$CA"
checkin c02d a "$E" "$CA"
ci "$KA"
sql "SELECT channel, status, checked_in, checked_in_at >= status_changed_at FROM tickets WHERE id IN ('$KV', '$KA') ORDER BY channel"
sql "SELECT status FROM events WHERE id = '$E'"
```

Esperado:
- `<E>`; `exit=0` duas vezes.
- Exatamente quatro linhas: `simulando 1 compra(s) simultânea(s) no evento <E> pelo canal vitrine`, `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0`, `simulando 1 compra(s) simultânea(s) no evento <E> pelo canal api`, `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0`.
- A linha `<KV> <CV> <KA> <CA>` (ids `tkt_…`, códigos de 8 caracteres `A-Z0-9`).
- `confirmed|<x>` duas vezes, com x ≥ 6,0 (os dois `…0001` confirmados em até 5 s).
- `status: confirmed (confirmado)|check-in: não` duas vezes.
- `c02a`: exatamente `200 | Entrada liberada | 1 | campo=""`; seis `ok:` (a resposta é a página de gestão do evento, com a mensagem em destaque na seção de check-in, o código conferido e o campo vazio com foco) e um `ausente:` (o código não volta ao campo).
- `status: confirmed (confirmado)|[sim]` (o ingresso passou a ter check-in e continua confirmado).
- `confirmed|t|<data e hora>` (marcação gravada com data e hora).
- `c02b`: exatamente `200 | Ingresso já utilizado | 1 | campo=""`; `ok:`; `marcação inalterada` (a segunda tentativa não muda a data e hora do check-in).
- `c02c`: exatamente `200 | Entrada liberada | 1 | campo=""`; `c02d`: exatamente `200 | Ingresso já utilizado | 1 | campo=""` (o ingresso da API passa pelo mesmo check-in).
- `status: confirmed (confirmado)|[sim]`.
- Exatamente `api|confirmed|t|t` e `vitrine|confirmed|t|t`.
- `publicado` (o check-in não muda o evento).

#### C03 — Pendente e recusado → `Ingresso não confirmado`; o `…0003` confirmado depois → `Entrada liberada`

```bash
. /tmp/catraca-f08/aux.sh
E=$(evento a 5 '100,00'); echo "$E"
compra --evento "$E" --cartao 4000000000000003 > "$T/c03-3.txt"
compra --evento "$E" --cartao 4000000000000004 > "$T/c03-4.txt"
compra --evento "$E" --cartao 4000000000000002 > "$T/c03-2.txt"
grep -h '^resumo: ' "$T/c03-3.txt" "$T/c03-4.txt" "$T/c03-2.txt"
K3=$(tkt "$T/c03-3.txt"); C3=$(cod "$T/c03-3.txt"); K4=$(tkt "$T/c03-4.txt"); C4=$(cod "$T/c03-4.txt"); K2=$(tkt "$T/c03-2.txt"); C2=$(cod "$T/c03-2.txt")
idade "$K2" 6
ci "$K3"; ci "$K4"; ci "$K2"
printf '0003: %s\n' "$(checkin c03a a "$E" "$C3")"
printf '0004: %s\n' "$(checkin c03b a "$E" "$C4")"
printf '0002: %s\n' "$(checkin c03c a "$E" "$C2")"
tem c03a '<p class="msg msg-error" role="alert" data-checkin-resultado="nao_confirmado">Ingresso não confirmado</p>'
idade "$K3" 0; idade "$K4" 0
sql "SELECT count(*) FILTER (WHERE checked_in), count(*) FROM tickets WHERE event_id = '$E'"
idade "$K3" 41; idade "$K4" 41
printf '0003 confirmado: %s\n' "$(checkin c03d a "$E" "$C3")"
printf '0004 recusado: %s\n' "$(checkin c03e a "$E" "$C4")"
ci "$K3"; ci "$K4"; ci "$K2"
```

Esperado:
- `<E>`; três linhas `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0`.
- `declined|<x>` com x ≥ 6,0.
- `status: pending (pendente)|check-in: não`, `status: pending (pendente)|check-in: não`, `status: declined (recusado)|check-in: não`.
- Exatamente `0003: 200 | Ingresso não confirmado | 1 | campo=""`, `0004: 200 | Ingresso não confirmado | 1 | campo=""` e `0002: 200 | Ingresso não confirmado | 1 | campo=""`; `ok:`.
- `pending|<x>` duas vezes, com x < 30,0 (os check-ins acima aconteceram com os dois ingressos ainda pendentes).
- `0|3` (nenhum ingresso do evento foi marcado).
- `confirmed|<x>` e `declined|<x>`, com x ≥ 41,0.
- Exatamente `0003 confirmado: 200 | Entrada liberada | 1 | campo=""` (o check-in lê o status atual do ingresso) e `0004 recusado: 200 | Ingresso não confirmado | 1 | campo=""`.
- `status: confirmed (confirmado)|[sim]`, `status: declined (recusado)|check-in: não`, `status: declined (recusado)|check-in: não`.

#### C04 — `ZZZZZZZZ`, código malformado e código de outro evento → `Ingresso inválido para este evento`

```bash
. /tmp/catraca-f08/aux.sh
E=$(evento a 5 '100,00'); E2=$(evento a 5 '100,00'); EB=$(evento b 5 '20,00'); echo "$E $E2 $EB"
compra --evento "$E" --cartao 4000000000000001 > "$T/c04-1.txt"
compra --evento "$E2" --cartao 4000000000000001 > "$T/c04-2.txt"
compra --evento "$EB" --cartao 4000000000000001 > "$T/c04-b.txt"
grep -h '^resumo: ' "$T/c04-1.txt" "$T/c04-2.txt" "$T/c04-b.txt"
K1=$(tkt "$T/c04-1.txt"); C1=$(cod "$T/c04-1.txt"); K2=$(tkt "$T/c04-2.txt"); C2=$(cod "$T/c04-2.txt"); KB=$(tkt "$T/c04-b.txt"); CB=$(cod "$T/c04-b.txt")
idade "$K1" 6; idade "$K2" 6; idade "$KB" 6
i=0
for c in ZZZZZZZZ ABC123 "${C1}X" "$(printf '%s' "$C1" | cut -c1-4)-$(printf '%s' "$C1" | cut -c5-8)" "$C2" "  $(minusc "$C2")  " "$CB"; do
  i=$((i + 1)); printf '%s [%s] %s\n' "$i" "$c" "$(checkin "c04-$i" a "$E" "$c")"
done
tem c04-1 "<h1>$(nome "$E")</h1>" '<p class="msg msg-error" role="alert" data-checkin-resultado="invalido">Ingresso inválido para este evento</p>'
ci "$K1"; ci "$K2"; ci "$KB"
printf 'A, código de E em E: %s\n' "$(checkin c04-k1 a "$E" "$C1")"
printf 'A, código de E2 em E2: %s\n' "$(checkin c04-k2 a "$E2" "$C2")"
printf 'B, código de EB em EB: %s\n' "$(checkin c04-kb b "$EB" "$CB")"
```

Esperado:
- `<E> <E2> <EB>`; três linhas `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0`.
- `confirmed|<x>` três vezes, com x ≥ 6,0.
- Exatamente 7 linhas, numeradas de 1 a 7, cada uma terminando em `] 200 | Ingresso inválido para este evento | 1 | campo=""`: `ZZZZZZZZ`; `ABC123`; o código de E com um caractere a mais; o código de E com um hífen no meio; o código de um ingresso de outro evento de A (E2); o mesmo código em minúsculas e com espaços nas pontas; o código de um ingresso de um evento do organizador B.
- Dois `ok:` (a resposta é a página de gestão de E, com a mensagem em destaque).
- `status: confirmed (confirmado)|check-in: não` três vezes (nenhuma tentativa marcou o ingresso de E, o de E2 ou o de B).
- Exatamente `A, código de E em E: 200 | Entrada liberada | 1 | campo=""`, `A, código de E2 em E2: 200 | Entrada liberada | 1 | campo=""` e `B, código de EB em EB: 200 | Entrada liberada | 1 | campo=""` (os códigos eram válidos, mas de outro evento).

#### C05 — Código com espaços nas pontas e minúsculas é aceito; em branco → `Informe o código do ingresso`

```bash
. /tmp/catraca-f08/aux.sh
E=$(evento a 5 '100,00'); echo "$E"
compra --evento "$E" --cartao 4000000000000001 --paralelas 2 > "$T/c05.txt"; grep '^resumo: ' "$T/c05.txt"
K1=$(tkt "$T/c05.txt" 1); C1=$(cod "$T/c05.txt" 1); K2=$(tkt "$T/c05.txt" 2); C2=$(cod "$T/c05.txt" 2)
idade "$K1" 6; idade "$K2" 6
printf 'vazio: %s\n' "$(checkin c05a a "$E" '')"
printf 'só espaços: %s\n' "$(checkin c05b a "$E" '     ')"
req c05c -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$E/checkin"
resultado c05c
tem c05a "<h1>$(nome "$E")</h1>" '<p class="msg msg-error" role="alert" data-checkin-resultado="codigo_vazio">Informe o código do ingresso</p>'
naotem c05a 'Código conferido'
sql "SELECT count(*) FILTER (WHERE checked_in), count(*) FROM tickets WHERE event_id = '$E'"
L1=" $(minusc "$C1") "
M2="   $(minusc "$(printf '%s' "$C2" | cut -c1-4)")$(printf '%s' "$C2" | cut -c5-8)  "
printf '[%s] %s\n' "$L1" "$(checkin c05d a "$E" "$L1")"
tem c05d "Código conferido: <strong>$C1</strong>"
naotem c05d "value=\"$L1\"" "value=\"$C1\"" "value=\"$(minusc "$C1")\""
printf '[%s] %s\n' "$C1" "$(checkin c05e a "$E" "$C1")"
printf '[%s] %s\n' "$M2" "$(checkin c05f a "$E" "$M2")"
tem c05f "Código conferido: <strong>$C2</strong>"
ci "$K1"; ci "$K2"
```

Esperado:
- `<E>`; `resumo: criadas 2, sold_out 0, event_not_available 0, invalid_request 0, erros 0`.
- `confirmed|<x>` duas vezes, com x ≥ 6,0.
- Exatamente `vazio: 422 | Informe o código do ingresso | 1 | campo=""` e `só espaços: 422 | Informe o código do ingresso | 1 | campo=""`.
- `c05c` (`POST` sem o campo): `422` e nenhuma outra linha; depois `Informe o código do ingresso`.
- Dois `ok:` e um `ausente:`.
- `0|2` (o código em branco não marcou nenhum ingresso).
- Exatamente `[ <C1 em minúsculas> ] 200 | Entrada liberada | 1 | campo=""`; `ok:` (o código conferido aparece normalizado em maiúsculas); três `ausente:` (nada do que foi digitado volta ao campo).
- Exatamente `[<C1>] 200 | Ingresso já utilizado | 1 | campo=""` (a forma maiúscula é o mesmo ingresso).
- Exatamente `[   <C2 com os 4 primeiros caracteres em minúsculas>  ] 200 | Entrada liberada | 1 | campo=""`; `ok:`.
- `status: confirmed (confirmado)|[sim]` duas vezes.

#### C06 — Evento cancelado: ingressos dele → `Evento cancelado`; código de outro evento → inválido; o campo continua

```bash
. /tmp/catraca-f08/aux.sh
E=$(evento a 5 '100,00'); E2=$(evento a 5 '100,00'); echo "$E $E2"
compra --evento "$E" --cartao 4000000000000001 --conta participante@catraca.test > "$T/c06-1.txt"
compra --evento "$E" --cartao 4000000000000001 --email "api.f08.$U@example.com" > "$T/c06-2.txt"
compra --evento "$E" --cartao 4000000000000003 > "$T/c06-3.txt"
compra --evento "$E" --cartao 4000000000000002 > "$T/c06-4.txt"
compra --evento "$E2" --cartao 4000000000000001 > "$T/c06-5.txt"
grep -h '^resumo: ' "$T/c06-1.txt" "$T/c06-2.txt" "$T/c06-3.txt" "$T/c06-4.txt" "$T/c06-5.txt"
K1=$(tkt "$T/c06-1.txt"); C1=$(cod "$T/c06-1.txt"); K2=$(tkt "$T/c06-2.txt"); C2=$(cod "$T/c06-2.txt")
K3=$(tkt "$T/c06-3.txt"); C3=$(cod "$T/c06-3.txt"); K4=$(tkt "$T/c06-4.txt"); C4=$(cod "$T/c06-4.txt")
K5=$(tkt "$T/c06-5.txt"); C5=$(cod "$T/c06-5.txt")
idade "$K1" 6; idade "$K2" 6; idade "$K4" 6; idade "$K5" 6
printf 'antes do cancelamento: %s\n' "$(checkin c06a a "$E" "$C1")"
cancelar c06b "$E"
idade "$K3" 0
ci "$K1"; ci "$K2"; ci "$K3"; ci "$K4"
req c06c -b "$T/a.jar" "$WEB/organizador/eventos/$E"
tem c06c '<strong data-status="cancelado">Cancelado</strong>' '<section class="gestao-secao" data-secao="checkin">' "<form method=\"post\" action=\"/organizador/eventos/$E/checkin\">" '<input id="codigo" name="codigo" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" value="">' '<button type="submit">Validar</button>'
naotem c06c "/organizador/eventos/$E/editar" 'Salvar alterações'
i=0
for c in "$C1" "$C2" "$C3" "$C4" "$C5" ZZZZZZZZ; do i=$((i + 1)); printf '%s: %s\n' "$i" "$(checkin "c06d$i" a "$E" "$c")"; done
tem c06d1 "<h1>$(nome "$E")</h1>" '<strong data-status="cancelado">Cancelado</strong>' '<p class="msg msg-error" role="alert" data-checkin-resultado="evento_cancelado">Evento cancelado</p>'
sql "SELECT status, checked_in FROM tickets WHERE event_id = '$E' ORDER BY created_at, id"
ci "$K5"
printf 'código de E2 em E2: %s\n' "$(checkin c06e a "$E2" "$C5")"
```

Esperado:
- `<E> <E2>`; cinco linhas `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0`.
- `confirmed|<x>`, `confirmed|<x>`, `declined|<x>`, `confirmed|<x>`, com x ≥ 6,0.
- Exatamente `antes do cancelamento: 200 | Entrada liberada | 1 | campo=""`.
- `c06b`: `302` e `location: /organizador/eventos/<E>?ok=cancelado`.
- `cancelled|<x>` com x < 30,0 (o `…0003` foi cancelado ainda pendente).
- Exatamente, nesta ordem: `status: refunded (estornado)|[sim]`, `status: refunded (estornado)|check-in: não`, `status: cancelled (cancelado)|check-in: não`, `status: declined (recusado)|check-in: não`.
- `c06c`: `200` e nenhuma outra linha; cinco `ok:` (evento `Cancelado`, e a seção de check-in continua com o campo e o botão `Validar`) e dois `ausente:` (sem formulário de edição).
- Exatamente 6 linhas: `1: 200 | Evento cancelado | 1 | campo=""` (estornado que passou pelo check-in), `2: 200 | Evento cancelado | 1 | campo=""` (estornado), `3: 200 | Evento cancelado | 1 | campo=""` (cancelado), `4: 200 | Evento cancelado | 1 | campo=""` (recusado), `5: 200 | Ingresso inválido para este evento | 1 | campo=""` (ingresso de outro evento) e `6: 200 | Ingresso inválido para este evento | 1 | campo=""`.
- Três `ok:` (a resposta é a página de gestão do evento cancelado, com a mensagem em destaque).
- Exatamente 4 linhas: `refunded|t`, `refunded|f`, `cancelled|f`, `declined|f` (nenhuma tentativa no evento cancelado marcou ingresso).
- `status: confirmed (confirmado)|check-in: não` (o ingresso do outro evento não foi tocado).
- Exatamente `código de E2 em E2: 200 | Entrada liberada | 1 | campo=""`.

#### C07 — Só o dono opera o check-in

```bash
. /tmp/catraca-f08/aux.sh
E=$(evento a 5 '100,00'); EB=$(evento b 5 '20,00'); N=$(nome "$E"); echo "$E $EB"
compra --evento "$E" --cartao 4000000000000001 > "$T/c07.txt"; grep '^resumo: ' "$T/c07.txt"
K=$(tkt "$T/c07.txt"); C=$(cod "$T/c07.txt")
idade "$K" 6
req c07a -b "$T/b.jar" "$WEB/organizador/eventos/$E"
naotem c07a "$N" 'data-secao="checkin"' "/organizador/eventos/$E/checkin"
printf 'B, código válido: %s\n' "$(checkin c07b b "$E" "$C")"
printf 'B, código em branco: %s\n' "$(checkin c07c b "$E" '')"
printf 'B, evento inexistente: %s\n' "$(checkin c07d b evt_0000000000000000 "$C")"
req c07e -b "$T/b.jar" "$WEB/organizador/eventos/$E/checkin"
for i in c07a c07b c07c c07d c07e; do echo "$i $(conta $i '<h1>Evento não encontrado</h1>') $(grep -cE "$N|$C|data-checkin-resultado|Informe o código" "$T/$i.html")"; done
cmp -s "$T/c07b.html" "$T/c07d.html" && echo "404 idêntico ao de evento inexistente" || echo "404 DIFERENTE"
printf 'B, no próprio evento: %s\n' "$(checkin c07f b "$EB" "$C")"
printf 'participante: %s\n' "$(checkin c07g p "$E" "$C")"
echo "$(conta c07g '<h1>Acesso negado</h1>') $(conta c07g "$N")"
printf 'visitante: %s\n' "$(checkin c07h - "$E" "$C")"
ci "$K"
marca "$K"
printf 'A: %s\n' "$(checkin c07i a "$E" "$C")"
```

Esperado:
- `<E> <EB>`; `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0`; `confirmed|<x>` com x ≥ 6,0.
- `c07a`: `404` e nenhuma outra linha; três `ausente:` (B não vê o nome de E, a seção de check-in nem o endereço da ação).
- Exatamente `B, código válido: 404 | - | 0 | campo=ausente`, `B, código em branco: 404 | - | 0 | campo=ausente` (o isolamento vem antes de qualquer validação do código) e `B, evento inexistente: 404 | - | 0 | campo=ausente`.
- `c07e`: `404` e nenhuma outra linha.
- O laço imprime exatamente `c07a 1 0`, `c07b 1 0`, `c07c 1 0`, `c07d 1 0`, `c07e 1 0` (página `Evento não encontrado`, sem nome do evento, sem o código, sem resultado de check-in).
- `404 idêntico ao de evento inexistente`.
- Exatamente `B, no próprio evento: 200 | Ingresso inválido para este evento | 1 | campo=""` (o código de A não serve no evento de B e nada revela).
- Exatamente `participante: 403 | - | 0 | campo=ausente`; `1 0` (página `Acesso negado`, sem o nome do evento).
- Exatamente `visitante: 302 location: /entrar | - | 0 | campo=ausente`.
- `status: confirmed (confirmado)|check-in: não` e `confirmed|f|-` (nenhuma das tentativas acima processou o código).
- Exatamente `A: 200 | Entrada liberada | 1 | campo=""` (o dono libera o mesmo código).

#### C08 — Check-ins simultâneos do mesmo código: exatamente um liberado

```bash
. /tmp/catraca-f08/aux.sh
E=$(evento a 5 '10,00'); echo "$E"
compra --evento "$E" --cartao 4000000000000001 --paralelas 3 > "$T/c08.txt"; grep '^resumo: ' "$T/c08.txt"
for n in 1 2 3; do idade "$(tkt "$T/c08.txt" "$n")" 6; done
for r in 1 2 3; do
  C=$(cod "$T/c08.txt" "$r")
  seq 10 | xargs -P 10 -I{} curl -s -o "$T/c08-$r-{}.html" -w '%{http_code}\n' -b "$T/a.jar" --data-urlencode "codigo=$C" "$WEB/organizador/eventos/$E/checkin" | sort | uniq -c | awk -v r="$r" '{ $1 = $1; print "rodada " r " status: " $0 }'
  for i in $(seq 10); do resultado "c08-$r-$i"; done | sort | uniq -c | awk -v r="$r" '{ $1 = $1; print "rodada " r " resultado: " $0 }'
done
for n in 1 2 3; do ci "$(tkt "$T/c08.txt" "$n")"; done
sql "SELECT count(*) FILTER (WHERE checked_in), count(DISTINCT checked_in_at), count(*) FROM tickets WHERE event_id = '$E'"
```

Esperado:
- `<E>`; `resumo: criadas 3, sold_out 0, event_not_available 0, invalid_request 0, erros 0`; `confirmed|<x>` três vezes, com x ≥ 6,0.
- Para cada rodada `r` = 1, 2, 3 (cada uma com o código de um ingresso diferente), exatamente três linhas:
  ```
  rodada <r> status: 10 200
  rodada <r> resultado: 1 Entrada liberada
  rodada <r> resultado: 9 Ingresso já utilizado
  ```
- `status: confirmed (confirmado)|[sim]` três vezes.
- `3|3|3` (os três ingressos marcados, cada um com um único instante de check-in).

#### C09 — Fluxo do avaliador: passo 10 e a parte de check-in dos passos 11 e 14

```bash
. /tmp/catraca-f08/aux.sh
# passo 5 (preparação): conta de participante nova pela interface (F02)
PE="participante.f08.$U@example.com"
req c09a -c "$T/novo.jar" --data-urlencode "nome=Participante F08 $U" --data-urlencode "email=$PE" --data-urlencode "senha=senha-f08-$U" "$WEB/cadastro"
# passos 2 e 4: E1 (lotação 2, R$ 100,00), publicado pelo organizador A
E1=$(evento a 2 '100,00'); N1=$(nome "$E1"); echo "$E1"
# passo 5: compra de E1 com 0001 pela conta nova (C1); passo 6: compra com 0004 por e-mail (C2)
compra --evento "$E1" --cartao 4000000000000001 --conta "$PE" > "$T/c09-1.txt"
compra --evento "$E1" --cartao 4000000000000004 --email t2@example.com > "$T/c09-2.txt"
grep -hE '^(simulando|resumo)' "$T/c09-1.txt" "$T/c09-2.txt" | sed "s/$E1/<E1>/"
K1=$(tkt "$T/c09-1.txt"); C1=$(cod "$T/c09-1.txt"); K2=$(tkt "$T/c09-2.txt"); C2=$(cod "$T/c09-2.txt")
idade "$K1" 6
printf 'C2 ainda pendente: %s\n' "$(checkin c09b a "$E1" "$C2")"
# passo 8: passados 45 s da compra de C2, ela está recusada
idade "$K2" 46
ci "$K1"; ci "$K2"
# passo 10
printf 'C1: %s\n' "$(checkin c09c a "$E1" "$C1")"
printf 'C1 de novo: %s\n' "$(checkin c09d a "$E1" "$C1")"
printf 'C2: %s\n' "$(checkin c09e a "$E1" "$C2")"
printf 'ZZZZZZZZ: %s\n' "$(checkin c09f a "$E1" ZZZZZZZZ)"
ci "$K1"
sql "SELECT count(*) FILTER (WHERE status = 'confirmed' AND checked_in) FROM tickets WHERE event_id = '$E1'"
# passo 11: B cria e publica E2 (lotação 1, R$ 20,00) e o compra com 0001 (C3)
E2=$(evento b 1 '20,00'); echo "$E2"
compra --evento "$E2" --cartao 4000000000000001 --email "c3.$U@example.com" > "$T/c09-3.txt"; grep '^resumo: ' "$T/c09-3.txt"
K3=$(tkt "$T/c09-3.txt"); C3=$(cod "$T/c09-3.txt")
idade "$K3" 6
req c09g -b "$T/b.jar" "$WEB/organizador"
naotem c09g "$E1" "$N1"
req c09h -b "$T/b.jar" "$WEB/organizador/eventos/$E1"
naotem c09h "$N1" 'data-secao="checkin"' "/organizador/eventos/$E1/checkin"
printf 'B no check-in de E1: %s\n' "$(checkin c09i b "$E1" "$C3")"
req c09j -b "$T/p.jar" "$WEB/organizador/eventos/$E1"
naotem c09j "$N1" 'data-secao="checkin"'
req c09k "$WEB/organizador/eventos/$E1"
printf 'C3 no check-in de E1: %s\n' "$(checkin c09l a "$E1" "$C3")"
ci "$K3"
# passos 12 a 14: E3 (lotação 5, R$ 50,00) com 0003 (T5) e 0001 (T6, C6), cancelado antes dos 30 s de T5
E3=$(evento a 5 '50,00'); echo "$E3"
compra --evento "$E3" --cartao 4000000000000003 --email t5@example.com > "$T/c09-5.txt"
compra --evento "$E3" --cartao 4000000000000001 --email t6@example.com > "$T/c09-6.txt"
K5=$(tkt "$T/c09-5.txt"); C5=$(cod "$T/c09-5.txt"); K6=$(tkt "$T/c09-6.txt"); C6=$(cod "$T/c09-6.txt")
idade "$K6" 6
cancelar c09m "$E3"
idade "$K5" 0
ci "$K6"; ci "$K5"
printf 'C6 no check-in de E3: %s\n' "$(checkin c09n a "$E3" "$C6")"
printf 'C5 no check-in de E3: %s\n' "$(checkin c09o a "$E3" "$C5")"
```

Esperado:
- `c09a`: `302`, `location: /` e uma linha `set-cookie: catraca_sessao=…` (conta de participante criada pela interface).
- `<E1>`.
- Exatamente quatro linhas: `simulando 1 compra(s) simultânea(s) no evento <E1> pelo canal vitrine`, `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0`, `simulando 1 compra(s) simultânea(s) no evento <E1> pelo canal api`, `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0`.
- `confirmed|<x>` com x ≥ 6,0.
- Exatamente `C2 ainda pendente: 200 | Ingresso não confirmado | 1 | campo=""`.
- `declined|<x>` com x ≥ 46,0.
- `status: confirmed (confirmado)|check-in: não` e `status: declined (recusado)|check-in: não`.
- Passo 10, exatamente: `C1: 200 | Entrada liberada | 1 | campo=""`, `C1 de novo: 200 | Ingresso já utilizado | 1 | campo=""`, `C2: 200 | Ingresso não confirmado | 1 | campo=""`, `ZZZZZZZZ: 200 | Ingresso inválido para este evento | 1 | campo=""`.
- `status: confirmed (confirmado)|[sim]`; `1` (um ingresso confirmado com check-in em E1 — a marcação que o painel da F09 vai contar como Check-ins).
- `<E2>`; `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0`; `confirmed|<x>` com x ≥ 6,0.
- `c09g`: `200` e nenhuma outra linha; dois `ausente:` (a lista de B não mostra E1).
- `c09h`: `404` e nenhuma outra linha; três `ausente:` (o endereço de E1 não mostra nome nem check-in a B).
- Exatamente `B no check-in de E1: 404 | - | 0 | campo=ausente`.
- `c09j`: `403` e nenhuma outra linha; dois `ausente:` (participante da seed). `c09k`: `302` e `location: /entrar` (deslogado).
- Exatamente `C3 no check-in de E1: 200 | Ingresso inválido para este evento | 1 | campo=""`; `status: confirmed (confirmado)|check-in: não` (o ingresso de B não foi tocado).
- `<E3>`; `confirmed|<x>` com x ≥ 6,0; `c09m`: `302` e `location: /organizador/eventos/<E3>?ok=cancelado`; `cancelled|<x>` com x < 30,0.
- `status: refunded (estornado)|check-in: não` e `status: cancelled (cancelado)|check-in: não`.
- Passo 14, exatamente: `C6 no check-in de E3: 200 | Evento cancelado | 1 | campo=""` e `C5 no check-in de E3: 200 | Evento cancelado | 1 | campo=""`.

#### C10 — Testes automatizados da F08 passam nos gates

```bash
. /tmp/catraca-f08/aux.sh
grep -hoE 'F08-CA0[1-7]|CF1[45]' app/test/f08/*.test.ts | sort -u | paste -sd ' ' -
npm run gates -- test/f08 > "$T/c10.txt" 2>&1; echo "exit=$?"
grep -E '^\[gates\] ' "$T/c10.txt"
```

Esperado:
- Exatamente `CF14 CF15 F08-CA01 F08-CA02 F08-CA03 F08-CA04 F08-CA05 F08-CA06 F08-CA07` (cada critério tem teste com o ID no nome).
- `exit=0`.
- Entre as linhas `[gates] …` (além da linha do projeto Compose dos gates): `[gates] lint: ok`, `[gates] typecheck: ok`, `[gates] testes: ok (N executados, 0 falharam) [filtro: test/f08]` com `N` ≥ 30 e `[gates] resultado: OK` (inclusive os testes de check-ins simultâneos em conexões reais e da corrida entre check-in e cancelamento).

### Encerramento (depois do C10)

```bash
rm -rf /tmp/catraca-f08
```

Sem veredito. O `npm run down` final é feito pela skill de avaliação.

### 2.2 Roteiro opcional no navegador (sem veredito)

Complementa os itens acima para quem quiser ver a tela; não substitui nenhum item.

1. Num terminal, crie e publique um evento como organizador A (ou use um do C02) e compre-o com `docker compose exec app catraca compra:simular --evento <id> --cartao 4000000000000001`; anote o código.
2. Entre em `$WEB/entrar` com `organizador.a@catraca.test` / `catraca123` e abra `$WEB/organizador/eventos/<id>`: abaixo dos dados do evento há a seção "Check-in" com o campo `Código` e o botão `Validar`.
3. Digite o código em minúsculas, com espaços antes e depois, e clique em `Validar`: a página de gestão volta com `Entrada liberada` em destaque, `Código conferido: <CÓDIGO>` e o campo vazio, com o cursor nele.
4. Digite o mesmo código e valide: `Ingresso já utilizado`. Digite `ZZZZZZZZ`: `Ingresso inválido para este evento`. Valide com o campo vazio: `Informe o código do ingresso`.
5. Cancele o evento (`Cancelar evento` → `Confirmar cancelamento`): a seção "Check-in" continua; o código do passo 3 resulta em `Evento cancelado`.

## 3. Mapeamento critério → itens

| Critério (PRD) | Itens |
|----------------|-------|
| F08-CA01 | C01, C02, C05, C10 |
| F08-CA02 | C02, C08, C09, C10 |
| F08-CA03 | C02, C08, C09, C10 |
| F08-CA04 | C03, C09, C10 |
| F08-CA05 | C04, C09, C10 |
| F08-CA06 | C06, C09, C10 |
| F08-CA07 | C05, C10 |
| CF14 (F04 → F08) | C01, C06, C07, C09, C10 |
| CF15 (F05 → F08) | C02, C03, C04, C09, C10 |

Notas do mapeamento:
- **F08-CA01 (R04, R10):** C01 mostra o campo na página de gestão em todos os status (inclusive cancelado); C02 mostra que o envio exibe a mensagem do resultado em destaque, na própria página de gestão, e limpa o campo (PRD F08, Experiência 2); C05 mostra a mensagem do código em branco (PRD F08, Tratamento de erros).
- **F08-CA02/CA03 (R10):** C02 cobre a marcação (`check-in: sim em …`, data e hora no banco) e a repetição nos dois canais (`--conta` = vitrine, `--email` = API; PRD F08: "ingressos de qualquer canal"); C08 cobre "numa operação atômica (dois check-ins simultâneos do mesmo código geram um `Entrada liberada` e um `Ingresso já utilizado`)", com 10 envios simultâneos por código em 3 rodadas.
- **F08-CA04:** C03 usa `…0003` e `…0004` (pendentes até 30 s) e `…0002` (recusado em 2–5 s), e mostra que o check-in lê o status atual (o `…0003` confirmado depois libera; o `…0004` recusado continua não confirmado).
- **F08-CA05:** C04 inclui `ZZZZZZZZ`, códigos malformados, o código de outro evento do mesmo organizador e o de um evento de outro organizador, e prova que esses códigos eram válidos nos próprios eventos.
- **F08-CA06 (R10, R11):** C06 cancela pela F04 um evento com ingresso estornado com check-in, estornado sem check-in, cancelado (pendente na hora do cancelamento) e recusado; o campo continua disponível e vale a lista (a situação 1 vem antes da 2: código de outro evento é inválido mesmo em evento cancelado).
- **F08-CA07:** C05 usa o código em minúsculas com espaços nas pontas (e uma variação com caixa misturada), e a forma maiúscula do mesmo código resulta em `Ingresso já utilizado`.
- **CF14 (F04 → F08; R04, R10, R11, R13):** a seção fica na página de gestão da F04 (C01); em evento cancelado pela F04, o código de um ingresso dele resulta em `Evento cancelado` (C06, C09 passo 14); o organizador B não acessa o check-in de evento de A — página e ação respondem o `404` da F04 sem processar o código, também com código em branco —, o participante recebe `403` e o visitante vai para `/entrar` (C07, C09 passo 11).
- **CF15 (F05 → F08; R09, R10):** o check-in lê status e código dos ingressos criados pelo serviço de compra da F05 com os tempos reais do gateway: `confirmed` → `Entrada liberada` e, de novo, `Ingresso já utilizado` (C02); `pending`/`declined` → `Ingresso não confirmado` (C03); código inexistente ou de outro evento → `Ingresso inválido para este evento` (C04).
- **C09** reproduz, com as superfícies existentes depois de F04 e F05, o passo 10 do Fluxo do avaliador (C1 liberado, de novo já utilizado, C2 não confirmado, `ZZZZZZZZ` inválido) e a parte de check-in dos passos 11 (B sem acesso a E1; C3, de um evento de B, inválido no check-in de E1) e 14 (C6 do evento cancelado → `Evento cancelado`). As compras que no fluxo são feitas pela vitrine e pela API são feitas aqui pelo `compra:simular` nos mesmos canais (`--conta` e `--email`).
- **C10** roda os testes da spec (matriz da ordem de R10, normalização, concorrência real, corrida com o cancelamento, isolamento); apoia todos os critérios, que também têm itens de comportamento no produto em execução.

## 4. Fora deste contrato

- **CF18 (F08 → F09)** e **CF20 (F07, F08 → F09):** Check-ins no painel e `"checkedIn":true` na consulta da API depois de um check-in liberado — contrato da F09, a feature envolvida implementada por último. Aqui a marcação é verificada pelo `ingresso:consultar` (`check-in: sim em …`) e pelo banco (`checked_in`, `checked_in_at`; C02, C08, C09).
- Compras pela vitrine (F06) e pela API de parceiros (F07): features da mesma wave; os canais `vitrine` e `api` são exercitados pelo `compra:simular` da F05 (`--conta` e `--email`), que usa o mesmo serviço de compra.
- Estados dos ingressos no cancelamento (`refunded`/`cancelled` em até 10 s, resposta tardia ignorada): contrato da F05 (C12) — aqui são só pré-condição do C06 e do C09.
- Isolamento da página de gestão e das ações da F04 (lista, edição, publicação, cancelamento): contrato da F04 (C13–C15); aqui só a seção e a ação de check-in.
- Desfazer check-in e check-in pela API de parceiros: fora de escopo do PRD.

## 5. Alterações do contrato

Nenhuma.
