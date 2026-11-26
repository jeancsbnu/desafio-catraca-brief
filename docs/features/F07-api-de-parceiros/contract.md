# Contrato: F07 — API de parceiros

## 1. Pré-requisitos de ambiente

- **Commit avaliado:** o avaliador registra o hash no relatório (`git rev-parse HEAD` na raiz do repositório avaliado — `main`, branch ou worktree da F07).
- **Onde roda:** na raiz da pasta do repositório avaliado, num shell `bash` (Linux, macOS ou WSL). Cada bloco do roteiro começa com `. /tmp/catraca-f07/aux.sh` (criado na Preparação), que entra na raiz do repositório e define variáveis e funções; por isso os blocos podem rodar em shells separados. O C12 roda inteiro dentro de um subshell `( … )`.
- **Subir:** `npm run up` · **Derrubar:** `npm run down` · **Gates:** `npm run gates` (comandos do `AGENTS.md`; nenhum `npm install`). Conforme a skill `evaluate-feature`, o avaliador roda `npm run down` e `npm run up` antes da Preparação.
- **Endereços:** `$WEB` = `$API` = `http://localhost:3000`; se a pasta avaliada tiver um `.env` com `CATRACA_PORT`, a Preparação usa essa porta. **Chave de parceiro:** `$KEY` = `parceiro-catraca-dev` (README, seção "Credenciais"); nenhuma `PARTNER_API_KEY` no shell nem no `.env` (conferido na Preparação).
- **Contas da seed:** organizador A (`organizador.a@catraca.test`), organizador B (`organizador.b@catraca.test`), participante (`participante@catraca.test`); senha `catraca123` para as três, conforme o README. O contrato usa o organizador A (criar, publicar, editar e cancelar eventos pela interface da F04) e o participante (compra pelo canal `vitrine` com o comando da F05, no C08 e no C10).
- **Modo:** padrão — gateway simulado com os **tempos reais do brief** (`…0001`/`…0002` em 2–5 s, `…0003`/`…0004` em 30–40 s). Nenhuma variável `GATEWAY_*` no shell nem no `.env`; um `.env` local só é aceito com `CATRACA_PORT` e/ou `COMPOSE_PROJECT_NAME`.
- **Superfícies usadas:** só as de F01–F05 e da própria F07: as três rotas da API de parceiros (com `curl`, como no Fluxo do avaliador); a interface HTTP da gestão de eventos da F04 (com o cookie do organizador A) para criar, publicar, editar e cancelar eventos; o comando `catraca compra:simular` da F05 (dentro do container `app`), com `--conta`, para criar ingressos pelo canal `vitrine`, porque a vitrine (F06) é da mesma wave; consultas SQL de leitura no container `db`; o `npm run gates`. Nenhum item usa vitrine, check-in ou painel.
- **Única escrita fora das superfícies do produto:** no C08, um `UPDATE` que marca o check-in de um ingresso confirmado direto no banco (a F08, dona do check-in, é da mesma wave), para conferir que a consulta da API reflete `checkedIn`.
- **Como medir tempo:** a função `aos` espera o ingresso completar N segundos de vida no relógio do banco (`tickets.created_at`), consulta a API e imprime o `status` devolvido e a idade medida logo depois da consulta; a função `janela` mostra o instante da mudança de status gravado pela F05 (`status_changed_at − created_at`). O relógio do host só é usado para esperar.
- **Ferramentas do avaliador:** `bash`, `git`, `curl`, `awk`, `sed`, `grep`, `sort`, `uniq`, `seq`, `xargs`, `wc`, `docker` com Compose v2, `node` (LTS), `npm`.
- **Datas:** a Preparação calcula `PROX` = dia 15 do mês seguinte, 21:00 (`AAAA-MM-DDTHH:MM`, fuso `America/Sao_Paulo`), usada em todos os eventos; na API, esse início aparece como `<PROX>:00-03:00`.
- **Ordem e dados:** os itens rodam na ordem numérica. Cada item cria os próprios eventos (função `evento`, nomes `Evento F07 <U>-<n>`, sufixo `$U` único por avaliação) e as próprias compras, e não depende de outro item. Dados criados: eventos do organizador A (publicados, rascunhos e cancelados), ingressos dos canais `api` e `vitrine` e tentativas de pagamento. O C12 cria um clone temporário em `/tmp`, com projeto do Compose e volume próprios, e apaga tudo ao final. Nenhuma conta nova.
- **Duração:** cerca de 4 minutos para C01–C11 (C10 espera cerca de 55 s e C11 cerca de 50 s), mais o C12, que constrói a imagem no clone (alguns minutos na primeira vez), e o C13, que constrói a imagem dos gates — use um tempo-limite de pelo menos 10 minutos para esses dois.

### Preparação (antes do C01)

```bash
# na raiz do repositório avaliado, com o ambiente já subido por npm run up
git status --porcelain | wc -l
git rev-parse HEAD
env | grep -cE '^(GATEWAY_|PARTNER_API_KEY=)'
if [ -e .env ]; then grep -vE '^[[:space:]]*(#|$)' .env | grep -cvE '^(CATRACA_PORT|COMPOSE_PROJECT_NAME)='; else echo "sem .env"; fi
mkdir -p /tmp/catraca-f07 && rm -rf /tmp/catraca-f07/*
printf "cd '%s'\n" "$(git rev-parse --show-toplevel)" > /tmp/catraca-f07/aux.sh
printf "REPO='%s'\nCOMMIT=%s\nU=%s\n" "$(git rev-parse --show-toplevel)" "$(git rev-parse HEAD)" "$(date +%s)" >> /tmp/catraca-f07/aux.sh
TZ=America/Sao_Paulo node -e '
const p = (n) => String(n).padStart(2, "0");
const h = new Date();
const a = new Date(h.getFullYear(), h.getMonth() + 1, 15);
console.log(`PROX=${a.getFullYear()}-${p(a.getMonth() + 1)}-${p(a.getDate())}T21:00`);
' >> /tmp/catraca-f07/aux.sh
cat >> /tmp/catraca-f07/aux.sh <<'EOF'
T=/tmp/catraca-f07
PORTA=${CATRACA_PORT:-$(sed -n 's/^CATRACA_PORT=//p' .env 2>/dev/null | tail -n 1)}
WEB=http://localhost:${PORTA:-3000}
API=$WEB
KEY=parceiro-catraca-dev
JAR=$T/a.jar
# formato do -w do curl: logo depois do corpo, na mesma linha, " <status> <content-type>"
L=' %{http_code} %{content_type}\n'
# req <id> [opções do curl] <url>: (interface da F04) imprime o status e as linhas location/set-cookie; corpo em $T/<id>.html
req() { _id=$1; shift; curl -s -o "$T/$_id.html" -D "$T/$_id.h" -w '%{http_code}\n' "$@"; tr -d '\r' < "$T/$_id.h" | awk '{ i = index($0, ":"); n = tolower(substr($0, 1, i - 1)); if (n == "location" || n == "set-cookie") print n ":" substr($0, i + 1) }'; }
sql() { docker compose exec -T db psql -U catraca -d catraca -At -c "$1" < /dev/null; }
entrar() { req "$1" -c "$2" -b "$2" --data-urlencode "email=$3" --data-urlencode "senha=catraca123" "$WEB/entrar"; }
# evento <lotação> <preço> [rascunho]: cria um evento novo do organizador A pela F04 (nome "Evento F07 <U>-<n>", ou $NOME) e publica, salvo "rascunho"; imprime o id
evento() {
  _k=$(( $(cat "$T/k" 2>/dev/null || echo 0) + 1 )); echo "$_k" > "$T/k"
  _s=$(req "ev$_k" -b "$JAR" --data-urlencode "nome=${NOME:-Evento F07 $U-$_k}" --data-urlencode "inicio=$PROX" --data-urlencode "local=Local F07 $U" --data-urlencode "lotacao=$1" --data-urlencode "preco=$2" "$WEB/organizador/eventos" | head -n 1)
  _e=$(tr -d '\r' < "$T/ev$_k.h" | sed -n 's|^[Ll]ocation: /organizador/eventos/\(evt_[a-z0-9]\{16\}\)?ok=criado$|\1|p')
  if [ "$_s" != 302 ] || [ -z "$_e" ]; then echo "FALHA: criar evento respondeu $_s" >&2; return 1; fi
  if [ "${3-}" != rascunho ]; then
    _s=$(req "pu$_k" -b "$JAR" -X POST "$WEB/organizador/eventos/$_e/publicar" | head -n 1)
    if [ "$_s" != 302 ]; then echo "FALHA: publicar respondeu $_s" >&2; return 1; fi
  fi
  echo "$_e"
}
# publicar <id> <evento>, editar <id> <evento> <lotação> <preço>, cancelar <id> <evento>: ações da página de gestão da F04
publicar() { req "$1" -b "$JAR" -X POST "$WEB/organizador/eventos/$2/publicar"; }
editar() { _n=$(sql "SELECT name FROM events WHERE id = '$2'"); req "$1" -b "$JAR" --data-urlencode "nome=$_n" --data-urlencode "inicio=$PROX" --data-urlencode "local=Local F07 $U" --data-urlencode "lotacao=$3" --data-urlencode "preco=$4" "$WEB/organizador/eventos/$2/editar"; }
cancelar() { req "$1" -b "$JAR" --data-urlencode 'confirmar=sim' "$WEB/organizador/eventos/$2/cancelar"; }
# compra: comando de diagnóstico da F05 (com --conta, compra pelo canal vitrine)
compra() { docker compose exec -T app catraca compra:simular "$@" < /dev/null; }
# comprar <evento> [cartão] [e-mail]: o POST de compra do passo 6 do brief; imprime "<corpo> <status> <content-type>"
comprar() { curl -s -w "$L" -X POST "$API/api/partner/events/$1/purchases" -H "X-Api-Key: $KEY" -H "Content-Type: application/json" -d "{\"buyerEmail\":\"${3:-ana@example.com}\",\"cardNumber\":\"${2:-4000000000000001}\"}"; }
# corpo <evento> <rótulo> <content-type ou -> <corpo>: POST de compra com a chave e o Content-Type/corpo dados ("-" = sem Content-Type); imprime "[rótulo] <corpo> <status> <content-type>"
corpo() { _h="Content-Type: $3"; [ "$3" = - ] && _h='Content-Type:'; printf '[%s] ' "$2"; curl -s -w "$L" -X POST "$API/api/partner/events/$1/purchases" -H "X-Api-Key: $KEY" -H "$_h" --data-binary "$4"; }
# ingresso <tkt>: a consulta do passo 8 do brief; imprime "<corpo> <status> <content-type>"
ingresso() { curl -s -w "$L" -H "X-Api-Key: $KEY" "$API/api/partner/tickets/$1"; }
# listar <arquivo>: a listagem do passo 2 do brief; corpo no arquivo; imprime "<status> <content-type>"
listar() { curl -s -o "$1" -w '%{http_code} %{content_type}\n' -H "X-Api-Key: $KEY" "$API/api/partner/events"; }
js() { node "$T/json.mjs" "$@"; }
# vagas <arquivo> <evento>: availableSeats do evento na listagem guardada ("ausente" se o evento não estiver nela)
vagas() { js campo "$1" "$2" availableSeats; }
tkt() { grep -oE 'tkt_[a-z0-9]{16}' "$1" | sed -n "${2:-1}p"; }
cod() { grep -oE '"code":"[A-Z0-9]{8}"' "$1" | head -n 1 | cut -d'"' -f4; }
# mascara: troca tkt_<16 [a-z0-9]> por <tkt> e "code":"<8 [A-Z0-9]>" por "code":"<código>" (filtro; só troca o que tem o formato certo)
mascara() { sed -E 's/tkt_[a-z0-9]{16}/<tkt>/g; s/"code":"[A-Z0-9]{8}"/"code":"<código>"/g'; }
# aos <tkt> <s>: espera o ingresso completar <s> s de vida (relógio do banco), consulta a API e imprime "<status na API>|<idade logo depois da consulta>"
aos() {
  _r=$(sql "SELECT greatest(0, $2 - EXTRACT(EPOCH FROM clock_timestamp() - created_at)) FROM tickets WHERE id = '$1'")
  sleep "${_r:-0}"
  _st=$(curl -s -H "X-Api-Key: $KEY" "$API/api/partner/tickets/$1" | sed -n 's/.*"status":"\([a-z]*\)".*/\1/p')
  echo "${_st:-?}|$(sql "SELECT round(EXTRACT(EPOCH FROM clock_timestamp() - created_at)::numeric, 1) FROM tickets WHERE id = '$1'")"
}
# janela <tkt> <a> <b>: status|segundos entre a criação e a última mudança de status (gravados pela F05)|dentro ou fora de [a; b]
janela() { sql "SELECT status, round(EXTRACT(EPOCH FROM status_changed_at - created_at)::numeric, 3), CASE WHEN EXTRACT(EPOCH FROM status_changed_at - created_at) BETWEEN $2 AND $3 THEN 'dentro' ELSE 'fora' END FROM tickets WHERE id = '$1'"; }
# ocupadas <evento>: ingressos pending+confirmed|total de ingressos do evento
ocupadas() { sql "SELECT count(*) FILTER (WHERE status IN ('pending', 'confirmed')), count(*) FROM tickets WHERE event_id = '$1'"; }
EOF
cat > /tmp/catraca-f07/json.mjs <<'JS'
// Lê uma listagem da API guardada em arquivo.
// Uso: node json.mjs item <arquivo> <evento> | campo <arquivo> <evento> <campo> | confere <arquivo da API> <arquivo do banco>
import { readFileSync } from 'node:fs';

const [modo, arquivo, ...resto] = process.argv.slice(2);
const ler = (caminho) => JSON.parse(readFileSync(caminho, 'utf8'));
let lista;
try {
  lista = ler(arquivo);
} catch {
  console.log('corpo não é JSON');
  process.exit(0);
}
if (!Array.isArray(lista)) {
  console.log('corpo não é um array');
  process.exit(0);
}
const objetos = lista.filter((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
if (modo === 'item' || modo === 'campo') {
  const achados = objetos.filter((x) => x.id === resto[0]);
  if (achados.length === 0) console.log('ausente');
  else if (achados.length > 1) console.log(`repetido ${achados.length} vezes`);
  else console.log(modo === 'item' ? JSON.stringify(achados[0]) : String(JSON.stringify(achados[0][resto[1]])));
} else if (modo === 'confere') {
  const banco = ler(resto[0]);
  const esperado = new Map(banco.map((e) => [e.id, JSON.stringify(e)]));
  const exatos = objetos.filter((x) => Object.keys(x).join(',') === 'id,name,startsAt,priceCents,availableSeats').length;
  const iguais = objetos.filter((x) => esperado.get(x.id) === JSON.stringify(x)).length;
  const ids = objetos.map((x) => x.id);
  const mesmos = ids.length === lista.length && ids.length === esperado.size && new Set(ids).size === ids.length && ids.every((id) => esperado.has(id));
  console.log(`elementos ${lista.length} | campos exatos ${exatos} | iguais ao banco ${iguais} | ids = publicados no banco: ${mesmos ? 'sim' : 'não'}`);
} else {
  console.log(`modo desconhecido: ${modo}`);
  process.exit(2);
}
JS
. /tmp/catraca-f07/aux.sh
sed -n '2,5p' /tmp/catraca-f07/aux.sh
curl -s -w "$L" "$WEB/health"
sql "SELECT to_regclass('public.events') IS NOT NULL, to_regclass('public.tickets') IS NOT NULL"
docker compose exec -T app catraca help < /dev/null | grep -cE '^  (compra:simular|ingresso:consultar) '
docker compose logs --no-log-prefix app | grep -F '[catraca] módulos:' | tail -n 1
docker compose exec -T app catraca config < /dev/null | grep -E '^(GATEWAY_MODE|GATEWAY_DELAY_SCALE|PARTNER_API_KEY)='
entrar pa "$JAR" organizador.a@catraca.test
printf '[{"id":"evt_x","availableSeats":2},{"id":"evt_y"}]' > "$T/teste.json"; vagas "$T/teste.json" evt_x; vagas "$T/teste.json" evt_z
```

Esperado:
- `0` (árvore limpa); o hash do commit; `0` (nenhuma variável `GATEWAY_*` nem `PARTNER_API_KEY` no shell); `sem .env` ou `0` (o `.env` só tem `CATRACA_PORT`/`COMPOSE_PROJECT_NAME`).
- Quatro linhas: `REPO='<raiz do repositório>'`, `COMMIT=<hash>`, `U=<número>` e `PROX=<AAAA-MM>-15T21:00` (mês seguinte ao atual).
- `{"status":"ok"} 200 application/json; charset=utf-8`.
- `t|t` (as tabelas de eventos e de ingressos existem).
- `2` (o `help` lista `compra:simular` e `ingresso:consultar`).
- A linha de boot `[catraca] módulos: …` contém `ingressos` e, depois dele, `parceiros` (o módulo da F07 carrega depois do da F05).
- Exatamente `GATEWAY_MODE=simulado`, `GATEWAY_DELAY_SCALE=1` e `PARTNER_API_KEY=parceiro-catraca-dev` (tempos do brief; chave padrão do README, igual a `$KEY`).
- `pa`: `302`, `location: /organizador` e uma linha `set-cookie: catraca_sessao=…`.
- `2` e `ausente` (o auxiliar de JSON funciona).

Sem isso, o contrato não é executável.

**Convenções dos resultados esperados:**
- As chamadas à API com `-w "$L"` (e as funções `comprar`, `corpo`, `ingresso`) imprimem **uma linha**: o corpo da resposta exatamente como veio, um espaço, o status HTTP, um espaço e o `Content-Type` da resposta — por exemplo `{"error":"unauthorized"} 401 application/json; charset=utf-8`. A linha esperada precisa casar **byte a byte** (o corpo do brief, sem espaços extras, e `application/json; charset=utf-8`). `corpo` e os itens com `printf '[…] '` prefixam a linha com o rótulo entre colchetes.
- `listar` imprime `<status> <content-type>` (o corpo fica no arquivo); `vagas` e `js campo` imprimem o valor do campo em JSON (`2`) ou `ausente`; `js item` imprime o elemento do evento em JSON compacto (chaves na ordem em que vieram) ou `ausente`.
- `mascara` troca o id do ingresso por `<tkt>` e o código por `<código>` **só quando têm o formato certo** (`tkt_` + 16 `[a-z0-9]`; 8 `[A-Z0-9]`): uma linha mascarada igual à esperada também prova o formato.
- A saída de `req` (e de `publicar`/`editar`/`cancelar`/`entrar`) é o status na primeira linha e, depois, as linhas `location:`/`set-cookie:`.
- `evento` imprime só o id `evt_<16 caracteres [a-z0-9]>`; se imprimir `FALHA: …`, a superfície da F04 falhou e o item é ✗ `não executável`.
- `<E>`, `<K>`, `<C>`, `<U>`, `<PROX>`, `<n>` etc. indicam o valor da variável (ou do contador) no momento da execução. Números com casas decimais vêm do `psql` com ponto (`29.3`); as faixas abaixo usam vírgula (29,0 ≤ x).

## 2. Itens verificáveis

A tabela é o índice. Os comandos exatos e o resultado completo de cada item estão no roteiro 2.1, que prevalece sobre o resumo.

| ID | Item | Tipo | Como verificar (resumo) | Resultado esperado (resumo) | Regras |
|----|------|------|-------------------------|-----------------------------|--------|
| C01 | Listagem: rascunho fora, publicado com exatamente os cinco campos, preço vigente, vagas de R05, cancelado fora | HTTP | Rascunho E1 e publicado EC; listagem (passo 2); compra em EC; publicar E1 (passo 4); editar o preço de E1 para R$ 150,00; cancelar EC; conferência de toda a listagem contra o banco | E1 ausente como rascunho; depois `{"id":…,"name":"Jazz no Porão F07 <U>","startsAt":"<PROX>:00-03:00","priceCents":10000,"availableSeats":2}`; depois `15000`; EC com `availableSeats` 3 e, após a compra, 2; EC ausente depois de cancelado; toda a listagem = eventos publicados do banco, campos exatos | R02, R03, R05, R11 |
| C02 | Compra válida: `202` com `ticketId`, `code` e `"status":"pending"`, na hora | HTTP | `curl` do passo 6 num evento publicado; tempo; banco; cabeçalhos; compra com `Origin` de outro site | `{"ticketId":"tkt_…","code":"…","status":"pending"} 202 application/json; charset=utf-8` em menos de 1 s; ingresso do canal `api`, sem conta, valor 10000; sem `set-cookie`; a checagem de origem da F02 não se aplica | R06, R09 |
| C03 | Corpo inválido: `422 invalid_request`, nada criado | HTTP | 19 corpos/`Content-Type` inválidos (campo faltando, e-mail mal formado, `"cardNumber":"123"`, JSON malformado…); depois `Content-Type` com `charset` e campos extras | 19 × `{"error":"invalid_request"} 422 …`; contagens de ingressos e tentativas inalteradas; `charset` e campos extras → `202`, extras ignorados | R06 (cartão de 16 dígitos) |
| C04 | Evento inexistente, rascunho, cancelado ou id inválido: `404 event_not_available` | HTTP | Compra em `evt_0000000000000000`, rascunho, cancelado (passo 13) e `nao-e-um-evento`; depois publicar o rascunho e comprar | 5 × `{"error":"event_not_available"} 404 …`; nada criado; depois de publicar, `202` | R02, R11 |
| C05 | Sem vaga: `409 sold_out` | HTTP | Lotação 1 com 1 compra `…0001`; lotação 1 com 1 pendente `…0003`; nova compra em cada | `{"error":"sold_out"} 409 …` nos dois; 1 ingresso por evento; `availableSeats` 0 | R05, R07 |
| C06 | Ordem dos erros: `422` antes de `404` e `409`; `404` antes de `409` | HTTP | Corpo inválido em evento lotado, cancelado (que estava lotado), rascunho, inexistente e id inválido; corpo válido em lotado e em cancelado | Corpo inválido → `422` em todos; corpo válido: lotado → `409`, cancelado → `404` | R07, R11 |
| C07 | R07 pela API: 30 compras simultâneas em lotação 5, 3 rodadas em eventos novos | HTTP | O comando exato do passo 15 (`seq 30 \| xargs -P 30 … \| sort \| uniq -c`) em 3 eventos novos; banco; listagem | Em cada rodada exatamente `5 202` e `25 409`; 5 ingressos, 5 ocupando vaga, 5 códigos distintos; `availableSeats` 0; depois, 5 `confirmed` por evento | R05, R07 |
| C08 | Consulta do ingresso: exatamente cinco campos, qualquer canal, `checkedIn`, `404 ticket_not_found` | HTTP + CLI | Ingresso da API (`…0003`); ingresso pelo canal `vitrine` (`compra:simular --conta`); check-in marcado no banco; ids inexistentes, inválidos, código no lugar do id | `{"ticketId":…,"code":…,"eventId":…,"status":"pending","checkedIn":false} 200 …`; o da vitrine `confirmed` e depois `"checkedIn":true`; 4 × `{"error":"ticket_not_found"} 404 …` | R09 |
| C09 | Chave: `401 unauthorized` nas três rotas e em qualquer rota sob `/api/partner`, antes de qualquer outra validação | HTTP | Passo 16: sem cabeçalho e com chave errada nas três rotas; chave vazia, em maiúsculas, com sufixo, no `Authorization`, na query; sem chave com corpo malformado, cartão inválido, `text/plain`; caminhos e métodos desconhecidos; com chave, caminho desconhecido | 19 × `{"error":"unauthorized"} 401 …`; com a chave, caminho desconhecido → `{"error":"not_found"} 404 …`; cabeçalho em minúsculas → `200`; nada criado | — (contrato fixo da API) |
| C10 | Passos 4–8 pela API: `availableSeats` acompanha as vagas; `…0004` pendente aos 29 s e recusado até 45 s; `…0001` confirmado em até 5 s | TEMPO | Lotação 2 com 1 confirmado pelo canal `vitrine`; compra `…0004` (T2); compra seguinte antes de 30 s; consulta aos 29 s e aos 45 s; compra `…0001` (T3) e consulta aos 5 s | `availableSeats` 2 → 1 → 0; `409 sold_out` antes de 30 s; T2 `pending` aos 29 s e `declined` aos 45 s (recusa entre 30 e 40 s); `availableSeats` volta a 1; T3 `confirmed` aos 5 s (entre 2 e 5 s); `availableSeats` 0 | R05, R07, R08, R09 |
| C11 | CF13: ingressos da API no cancelamento — `refunded` e `cancelled` em até 10 s, `cancelled` continua depois de 45 s | TEMPO | Lotação 5, compras `…0003` (T5) e `…0001` (T6); T6 confirmado; cancelar pela F04 antes de 30 s de T5; listagem, compra, consultas; consulta de T5 aos 46 s | Evento fora da listagem; compra `404 event_not_available`; T6 `refunded` e T5 `cancelled` logo após o cancelamento (≤ 10 s); T5 ainda `cancelled` aos 46 s | R11 |
| C12 | F07-CA11: clone limpo, sem `.env` e sem chave de pagamento, compra pela API com `…0001` fica `confirmed` em até 5 s | TEMPO | `git clone` do commit avaliado em `/tmp`, `npm run up` com projeto e porta próprios só no Compose; configuração do container; evento pela F04; compra pela API; consulta aos 5 s; derrubar e apagar | `sem .env`; container sem `GATEWAY_*` nem `PARTNER_API_KEY`; `GATEWAY_MODE=simulado`; `202`; `confirmed` aos 5 s (entre 2 e 5 s); tudo removido; ambiente da avaliação intacto | R06, R08 |
| C13 | Testes da F07 passam nos gates (inclusive a rajada por HTTP real em 5 rodadas) | TEST | IDs nos testes; `npm run gates -- test/f07` | Todos os IDs F07-CA01…11 e CF10…13 nos testes; `exit=0`; `testes: ok (N executados, 0 falharam) [filtro: test/f07]` com N ≥ 30; `resultado: OK` | R07 |

### 2.1 Roteiro detalhado

Todos os comandos rodam a partir da raiz do repositório (o `aux.sh` faz o `cd`), salvo no C12, que entra no clone.

#### C01 — Listagem: rascunho fora, publicado com exatamente os cinco campos, preço vigente, vagas de R05, cancelado fora

```bash
. /tmp/catraca-f07/aux.sh
E1=$(NOME="Jazz no Porão F07 $U" evento 2 '100,00' rascunho); EC=$(evento 3 '20,00'); echo "$E1 $EC"
curl -s -H "X-Api-Key: $KEY" "$API/api/partner/events" > "$T/c01a.json"; echo "exit=$?"
js item "$T/c01a.json" "$E1"
js item "$T/c01a.json" "$EC"
comprar "$EC" 4000000000000001 | mascara
listar "$T/c01b.json"; vagas "$T/c01b.json" "$EC"
publicar c01p "$E1"
listar "$T/c01c.json"; js item "$T/c01c.json" "$E1"
editar c01e "$E1" 2 '150,00'
listar "$T/c01d.json"; js item "$T/c01d.json" "$E1"
cancelar c01x "$EC"
listar "$T/c01e.json"; js item "$T/c01e.json" "$EC"; vagas "$T/c01e.json" "$E1"
sql "SELECT coalesce(json_agg(json_build_object('id', e.id, 'name', e.name, 'startsAt', to_char(e.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD\"T\"HH24:MI:SS') || '-03:00', 'priceCents', e.price_cents, 'availableSeats', greatest(0, e.capacity - (SELECT count(*) FROM tickets t WHERE t.event_id = e.id AND t.status IN ('pending', 'confirmed'))))), '[]') FROM events e WHERE e.status = 'publicado'" > "$T/c01-banco.json"
js confere "$T/c01e.json" "$T/c01-banco.json"
```

Esperado:
- `<E1> <EC>` (dois ids `evt_…`); `exit=0`.
- `ausente` (E1 em rascunho não aparece na listagem — passo 2 do brief).
- `{"id":"<EC>","name":"Evento F07 <U>-<n>","startsAt":"<PROX>:00-03:00","priceCents":2000,"availableSeats":3}` (exatamente essas cinco chaves, nessa ordem).
- `{"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8`.
- `200 application/json; charset=utf-8` e `2` (o ingresso recém-comprado ocupa vaga: lotação 3 − 1).
- `c01p`: `302` e `location: /organizador/eventos/<E1>?ok=publicado`.
- `200 application/json; charset=utf-8` e exatamente `{"id":"<E1>","name":"Jazz no Porão F07 <U>","startsAt":"<PROX>:00-03:00","priceCents":10000,"availableSeats":2}` (passo 4 do brief: `availableSeats` 2 e `priceCents` 10000; nome com acento em UTF-8; início ISO 8601 com segundos e `-03:00`).
- `c01e`: `302` e `location: /organizador/eventos/<E1>?ok=atualizado`.
- `200 application/json; charset=utf-8` e exatamente `{"id":"<E1>","name":"Jazz no Porão F07 <U>","startsAt":"<PROX>:00-03:00","priceCents":15000,"availableSeats":2}` (o preço vigente da F04).
- `c01x`: `302` e `location: /organizador/eventos/<EC>?ok=cancelado`.
- `200 application/json; charset=utf-8`, `ausente` (o cancelado saiu da listagem) e `2`.
- `elementos <n> | campos exatos <n> | iguais ao banco <n> | ids = publicados no banco: sim`, com o mesmo `n` ≥ 1 nas três posições (todo elemento da listagem tem exatamente `id`, `name`, `startsAt`, `priceCents`, `availableSeats`, com os valores do banco — `availableSeats` = lotação − pendentes − confirmados —, e a listagem tem exatamente os eventos publicados, sem rascunhos nem cancelados).

#### C02 — Compra válida: `202` com `ticketId`, `code` e `"status":"pending"`, na hora

```bash
. /tmp/catraca-f07/aux.sh
E=$(evento 5 '100,00'); echo "$E"
N0=$(sql "SELECT count(*) FROM tickets")
curl -s -D "$T/c02.h" -w ' %{http_code} %{content_type} %{time_total}\n' -X POST "$API/api/partner/events/$E/purchases" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001"}' > "$T/c02.txt"; echo "exit=$?"
sed -E 's/ [0-9.]+$//' "$T/c02.txt" | mascara
awk '{ if ($NF + 0 < 1) print "em menos de 1 s"; else print "lenta: " $NF " s" }' "$T/c02.txt"
grep -cE '^\{"ticketId":"tkt_[a-z0-9]{16}","code":"[A-Z0-9]{8}","status":"pending"\} 202 ' "$T/c02.txt"
K=$(tkt "$T/c02.txt"); C=$(cod "$T/c02.txt"); echo "$K $C"
sql "SELECT code = '$C', event_id = '$E', status IN ('pending', 'confirmed'), channel, buyer_user_id IS NULL, buyer_email, price_paid_cents FROM tickets WHERE id = '$K'"
echo "$N0 $(sql "SELECT count(*) FROM tickets")"
tr -d '\r' < "$T/c02.h" | grep -ciE '^set-cookie:'
curl -s -w "$L" -X POST "$API/api/partner/events/$E/purchases" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -H "Origin: https://parceiro.example" -H "Sec-Fetch-Site: cross-site" \
  -d '{"buyerEmail":"bia@example.com","cardNumber":"4000000000000001"}' | mascara
ocupadas "$E"
```

Esperado:
- `<E>`; `exit=0`.
- `{"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8`.
- `em menos de 1 s` (a compra foi respondida sem esperar o gateway).
- `1` (o corpo é exatamente `{"ticketId":"tkt_…","code":"…","status":"pending"}`).
- `<K> <C>`.
- `t|t|t|api|t|ana@example.com|10000` (o código e o evento da resposta são os do banco; canal `api`, sem conta de participante, valor pago = preço vigente).
- `<N0> <N0 + 1>`.
- `0` (a resposta não tem `set-cookie`).
- `{"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8` (a checagem de origem da F02 não se aplica à API).
- `2|2`.

#### C03 — Corpo inválido: `422 invalid_request`, nada criado

```bash
. /tmp/catraca-f07/aux.sh
E=$(evento 5 '100,00'); echo "$E"
N0=$(sql "SELECT count(*) FROM tickets"); P0=$(sql "SELECT count(*) FROM payment_attempts")
J=application/json
corpo "$E" falta-buyerEmail $J '{"cardNumber":"4000000000000001"}'
corpo "$E" falta-cardNumber $J '{"buyerEmail":"ana@example.com"}'
corpo "$E" objeto-vazio $J '{}'
corpo "$E" email-mal-formado $J '{"buyerEmail":"nao-e-um-email","cardNumber":"4000000000000001"}'
corpo "$E" email-null $J '{"buyerEmail":null,"cardNumber":"4000000000000001"}'
corpo "$E" cartao-123 $J '{"buyerEmail":"ana@example.com","cardNumber":"123"}'
corpo "$E" cartao-15-digitos $J '{"buyerEmail":"ana@example.com","cardNumber":"400000000000001"}'
corpo "$E" cartao-17-digitos $J '{"buyerEmail":"ana@example.com","cardNumber":"40000000000000011"}'
corpo "$E" cartao-com-letra $J '{"buyerEmail":"ana@example.com","cardNumber":"400000000000000A"}'
corpo "$E" cartao-com-espacos $J '{"buyerEmail":"ana@example.com","cardNumber":"4000 0000 0000 0001"}'
corpo "$E" cartao-numero-json $J '{"buyerEmail":"ana@example.com","cardNumber":4000000000000001}'
corpo "$E" json-malformado $J '{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001"'
corpo "$E" nao-e-json $J 'isto não é json'
corpo "$E" array $J '[{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001"}]'
corpo "$E" null $J 'null'
corpo "$E" corpo-vazio $J ''
corpo "$E" sem-content-type - '{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001"}'
corpo "$E" text-plain text/plain '{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001"}'
corpo "$E" formulario application/x-www-form-urlencoded 'buyerEmail=ana%40example.com&cardNumber=4000000000000001'
echo "$N0 $(sql "SELECT count(*) FROM tickets") | $P0 $(sql "SELECT count(*) FROM payment_attempts")"
ocupadas "$E"
corpo "$E" charset 'application/json; charset=utf-8' '{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001"}' | mascara
corpo "$E" campos-extras $J '{"buyerEmail":"ana@example.com","cardNumber":"4000000000000003","quantity":3,"eventId":"evt_0000000000000000","channel":"vitrine","status":"confirmed"}' > "$T/c03x.txt"; mascara < "$T/c03x.txt"
KX=$(tkt "$T/c03x.txt"); sql "SELECT event_id = '$E', channel, buyer_user_id IS NULL, status FROM tickets WHERE id = '$KX'"
echo "$N0 $(sql "SELECT count(*) FROM tickets")"
```

Esperado:
- `<E>`.
- Exatamente estas 19 linhas, nesta ordem, cada uma com o corpo, o status e o `Content-Type` exatos:
  ```
  [falta-buyerEmail] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [falta-cardNumber] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [objeto-vazio] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [email-mal-formado] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [email-null] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [cartao-123] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [cartao-15-digitos] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [cartao-17-digitos] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [cartao-com-letra] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [cartao-com-espacos] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [cartao-numero-json] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [json-malformado] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [nao-e-json] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [array] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [null] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [corpo-vazio] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [sem-content-type] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [text-plain] {"error":"invalid_request"} 422 application/json; charset=utf-8
  [formulario] {"error":"invalid_request"} 422 application/json; charset=utf-8
  ```
  (nenhum `400` ou `415`: JSON malformado e `Content-Type` não suportado também são `422`).
- `<N0> <N0> | <P0> <P0>` (nenhum ingresso e nenhuma tentativa de pagamento gravados) e `0|0`.
- `[charset] {"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8` (`application/json` com parâmetro é aceito).
- `[campos-extras] {"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8` e `t|api|t|pending` (campos extras ignorados: o ingresso é do evento do caminho, canal `api`, sem conta, `pending` — cartão `…0003`).
- `<N0> <N0 + 2>`.

#### C04 — Evento inexistente, rascunho, cancelado ou id inválido: `404 event_not_available`

```bash
. /tmp/catraca-f07/aux.sh
R=$(evento 5 '100,00' rascunho); X=$(evento 5 '100,00'); echo "$R $X"
cancelar c04x "$X"
N0=$(sql "SELECT count(*) FROM tickets")
for e in evt_0000000000000000 "$R" "$X" nao-e-um-evento; do printf '[%s] ' "$e"; comprar "$e"; done
curl -s -w "$L" -X POST "$API/api/partner/events/$X/purchases" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"buyerEmail":"t7@example.com","cardNumber":"4000000000000001"}'
echo "$N0 $(sql "SELECT count(*) FROM tickets")"
ocupadas "$R"; ocupadas "$X"
publicar c04p "$R"
comprar "$R" | mascara
```

Esperado:
- `<R> <X>`; `c04x`: `302` e `location: /organizador/eventos/<X>?ok=cancelado`.
- Exatamente 4 linhas: `[evt_0000000000000000] {"error":"event_not_available"} 404 application/json; charset=utf-8`, `[<R>] {"error":"event_not_available"} 404 application/json; charset=utf-8`, `[<X>] {"error":"event_not_available"} 404 application/json; charset=utf-8` e `[nao-e-um-evento] {"error":"event_not_available"} 404 application/json; charset=utf-8`.
- `{"error":"event_not_available"} 404 application/json; charset=utf-8` (passo 13 do brief, evento cancelado).
- `<N0> <N0>`; `0|0` e `0|0` (nenhum ingresso criado).
- `c04p`: `302` e `location: /organizador/eventos/<R>?ok=publicado`; depois `{"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8` (o mesmo evento, publicado, aceita a compra).

#### C05 — Sem vaga: `409 sold_out`

```bash
. /tmp/catraca-f07/aux.sh
E=$(evento 1 '100,00'); echo "$E"
comprar "$E" | mascara
comprar "$E" 4000000000000001 bia@example.com
E2=$(evento 1 '100,00'); echo "$E2"
comprar "$E2" 4000000000000003 | mascara
comprar "$E2" 4000000000000001 bia@example.com
ocupadas "$E"; ocupadas "$E2"
listar "$T/c05.json"; vagas "$T/c05.json" "$E"; vagas "$T/c05.json" "$E2"
```

Esperado:
- `<E>`; `{"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8`; `{"error":"sold_out"} 409 application/json; charset=utf-8`.
- `<E2>`; `{"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8`; `{"error":"sold_out"} 409 application/json; charset=utf-8` (o pendente ocupa a única vaga).
- `1|1` e `1|1` (as recusas não criaram ingresso).
- `200 application/json; charset=utf-8`, `0` e `0`.

#### C06 — Ordem dos erros: `422` antes de `404` e `409`; `404` antes de `409`

```bash
. /tmp/catraca-f07/aux.sh
J=application/json
E=$(evento 1 '100,00'); echo "$E"
comprar "$E" | mascara
corpo "$E" lotado-cartao-123 $J '{"buyerEmail":"ana@example.com","cardNumber":"123"}'
corpo "$E" lotado-sem-buyerEmail $J '{"cardNumber":"4000000000000001"}'
corpo "$E" lotado-json-malformado $J '{"buyerEmail":'
comprar "$E" 4000000000000001 bia@example.com
cancelar c06x "$E"
corpo "$E" cancelado-cartao-123 $J '{"buyerEmail":"ana@example.com","cardNumber":"123"}'
corpo "$E" cancelado-email-mal-formado $J '{"buyerEmail":"ana","cardNumber":"4000000000000001"}'
corpo "$E" cancelado-json-malformado $J '{"buyerEmail":'
corpo "$E" cancelado-text-plain text/plain '{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001"}'
comprar "$E" 4000000000000001 bia@example.com
R=$(evento 1 '100,00' rascunho); echo "$R"
corpo "$R" rascunho-cartao-123 $J '{"buyerEmail":"ana@example.com","cardNumber":"123"}'
corpo evt_0000000000000000 inexistente-cartao-123 $J '{"buyerEmail":"ana@example.com","cardNumber":"123"}'
corpo nao-e-um-evento id-invalido-cartao-123 $J '{"buyerEmail":"ana@example.com","cardNumber":"123"}'
ocupadas "$E"; ocupadas "$R"
```

Esperado:
- `<E>`; `{"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8` (o evento fica sem vaga).
- `[lotado-cartao-123]`, `[lotado-sem-buyerEmail]` e `[lotado-json-malformado]`, cada uma seguida de ` {"error":"invalid_request"} 422 application/json; charset=utf-8` (corpo inválido num evento sem vaga → `422`, não `409`).
- `{"error":"sold_out"} 409 application/json; charset=utf-8` (corpo válido no mesmo evento).
- `c06x`: `302` e `location: /organizador/eventos/<E>?ok=cancelado`.
- `[cancelado-cartao-123]`, `[cancelado-email-mal-formado]`, `[cancelado-json-malformado]` e `[cancelado-text-plain]`, cada uma seguida de ` {"error":"invalid_request"} 422 application/json; charset=utf-8` (corpo inválido num evento cancelado → `422`, não `404`).
- `{"error":"event_not_available"} 404 application/json; charset=utf-8` (corpo válido num evento cancelado que estava lotado → `404`, não `409`).
- `<R>`; `[rascunho-cartao-123]`, `[inexistente-cartao-123]` e `[id-invalido-cartao-123]`, cada uma seguida de ` {"error":"invalid_request"} 422 application/json; charset=utf-8`.
- `0|1` (o único ingresso de E foi estornado ou cancelado com o evento; nenhuma tentativa criou outro) e `0|0`.

#### C07 — R07 pela API: 30 compras simultâneas em lotação 5, 3 rodadas em eventos novos

```bash
. /tmp/catraca-f07/aux.sh
rm -f "$T/c07-eventos.txt"
for r in 1 2 3; do
  E4=$(evento 5 '10,00') || break
  echo "$E4" >> "$T/c07-eventos.txt"
  echo "rodada $r"
  seq 30 | xargs -P 30 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "$API/api/partner/events/$E4/purchases" \
    -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
    -d '{"buyerEmail":"carga{}@example.com","cardNumber":"4000000000000001"}' | sort | uniq -c
  sql "SELECT count(*), count(*) FILTER (WHERE status IN ('pending', 'confirmed')), count(DISTINCT code), count(DISTINCT buyer_email), bool_and(channel = 'api') FROM tickets WHERE event_id = '$E4'"
  listar "$T/c07-l$r.json" > /dev/null; vagas "$T/c07-l$r.json" "$E4"
done
sleep 6
while read -r E4; do sql "SELECT count(*) FILTER (WHERE status = 'confirmed'), count(*) FROM tickets WHERE event_id = '$E4'"; done < "$T/c07-eventos.txt"
```

Esperado:
- Para **cada uma** das 3 rodadas, exatamente estas 5 linhas (os espaços à esquerda são os do `uniq -c`):
  ```
  rodada <r>
        5 202
       25 409
  5|5|5|5|t
  0
  ```
  ou seja: a saída do comando do passo 15 do brief tem exatamente duas linhas, 5 respostas `202` e 25 respostas `409` (nenhum outro status); o evento tem 5 ingressos, os 5 ocupando vaga, com 5 códigos distintos, de 5 compradores distintos, todos do canal `api`; e a listagem mostra `availableSeats` 0. Como ingressos nunca são apagados e uma recusa não grava nada, 5 ingressos no total também provam que as vagas ocupadas nunca passaram de 5.
- Depois, exatamente 3 linhas `5|5` (os 5 ingressos de cada evento ficaram `confirmed`).
- O item só passa se as três rodadas derem exatamente esse resultado, cada uma num evento novo.

#### C08 — Consulta do ingresso: exatamente cinco campos, qualquer canal, `checkedIn`, `404 ticket_not_found`

```bash
. /tmp/catraca-f07/aux.sh
E=$(evento 5 '100,00'); echo "$E"
comprar "$E" 4000000000000003 consulta@example.com > "$T/c08a.txt"; K=$(tkt "$T/c08a.txt"); C=$(cod "$T/c08a.txt"); echo "$K $C"
ingresso "$K"
compra --evento "$E" --cartao 4000000000000001 --conta participante@catraca.test > "$T/c08v.txt"; echo "exit=$?"
head -n 1 "$T/c08v.txt"
V=$(tkt "$T/c08v.txt"); CV=$(grep -oE 'código [A-Z0-9]{8}' "$T/c08v.txt" | cut -d' ' -f2); echo "$V $CV"
sql "SELECT channel, buyer_user_id IS NOT NULL, buyer_email FROM tickets WHERE id = '$V'"
aos "$V" 6
ingresso "$V"
sql "UPDATE tickets SET checked_in = true, checked_in_at = clock_timestamp() WHERE id = '$V' AND status = 'confirmed'"
ingresso "$V"
for k in tkt_0000000000000000 nao-e-um-ingresso "$C" "$(printf '%s' "$K" | tr 'a-z' 'A-Z')"; do printf '[%s] ' "$k"; ingresso "$k"; done
ingresso "$K"
```

Esperado:
- `<E>`; `<K> <C>`.
- Exatamente `{"ticketId":"<K>","code":"<C>","eventId":"<E>","status":"pending","checkedIn":false} 200 application/json; charset=utf-8` (as cinco chaves do brief, nessa ordem; `checkedIn` falso num ingresso novo).
- `exit=0` e `simulando 1 compra(s) simultânea(s) no evento <E> pelo canal vitrine`.
- `<V> <CV>`; `vitrine|t|participante@catraca.test` (ingresso da vitrine, ligado à conta do participante).
- `confirmed|<x>` com x ≥ 6,0.
- Exatamente `{"ticketId":"<V>","code":"<CV>","eventId":"<E>","status":"confirmed","checkedIn":false} 200 application/json; charset=utf-8` (a consulta mostra ingresso de qualquer canal).
- `UPDATE 1`; depois exatamente `{"ticketId":"<V>","code":"<CV>","eventId":"<E>","status":"confirmed","checkedIn":true} 200 application/json; charset=utf-8` (`checkedIn` reflete o ingresso).
- Exatamente 4 linhas: `[tkt_0000000000000000] {"error":"ticket_not_found"} 404 application/json; charset=utf-8`, `[nao-e-um-ingresso] …`, `[<C>] …` e `[<K em maiúsculas>] …`, todas com ` {"error":"ticket_not_found"} 404 application/json; charset=utf-8` (inexistente, id inválido, código no lugar do id, id em maiúsculas).
- Exatamente `{"ticketId":"<K>","code":"<C>","eventId":"<E>","status":"pending","checkedIn":false} 200 application/json; charset=utf-8` (o `…0003` continua pendente).

#### C09 — Chave: `401 unauthorized` nas três rotas e em qualquer rota sob `/api/partner`, antes de qualquer outra validação

```bash
. /tmp/catraca-f07/aux.sh
E=$(evento 1 '100,00'); X=$(evento 5 '100,00'); echo "$E $X"
comprar "$E" 4000000000000003 > "$T/c09a.txt"; K=$(tkt "$T/c09a.txt"); mascara < "$T/c09a.txt"
cancelar c09x "$X"
N0=$(sql "SELECT count(*) FROM tickets")
B='{"buyerEmail":"ana@example.com","cardNumber":"4000000000000001"}'
printf '[1] ';  curl -s -w "$L" "$API/api/partner/events"
printf '[2] ';  curl -s -w "$L" -H "X-Api-Key: chave-errada" "$API/api/partner/events"
printf '[3] ';  curl -s -w "$L" -X POST "$API/api/partner/events/$E/purchases" -H "Content-Type: application/json" -d "$B"
printf '[4] ';  curl -s -w "$L" -X POST "$API/api/partner/events/$E/purchases" -H "X-Api-Key: chave-errada" -H "Content-Type: application/json" -d "$B"
printf '[5] ';  curl -s -w "$L" "$API/api/partner/tickets/$K"
printf '[6] ';  curl -s -w "$L" -H "X-Api-Key: chave-errada" "$API/api/partner/tickets/$K"
printf '[7] ';  curl -s -w "$L" -H "X-Api-Key;" "$API/api/partner/events"
printf '[8] ';  curl -s -w "$L" -H "X-Api-Key: PARCEIRO-CATRACA-DEV" "$API/api/partner/events"
printf '[9] ';  curl -s -w "$L" -H "X-Api-Key: ${KEY}x" "$API/api/partner/events"
printf '[10] '; curl -s -w "$L" -H "Authorization: Bearer $KEY" "$API/api/partner/events"
printf '[11] '; curl -s -w "$L" "$API/api/partner/events?X-Api-Key=$KEY"
printf '[12] '; curl -s -w "$L" -X POST "$API/api/partner/events/evt_0000000000000000/purchases" -H "Content-Type: application/json" -d '{"buyerEmail":'
printf '[13] '; curl -s -w "$L" -X POST "$API/api/partner/events/$X/purchases" -H "X-Api-Key: chave-errada" -H "Content-Type: application/json" -d '{"buyerEmail":"ana@example.com","cardNumber":"123"}'
printf '[14] '; curl -s -w "$L" -X POST "$API/api/partner/events/$E/purchases" -H "X-Api-Key: chave-errada" -H "Content-Type: text/plain" -d "$B"
printf '[15] '; curl -s -w "$L" -H "X-Api-Key: chave-errada" "$API/api/partner/tickets/tkt_0000000000000000"
printf '[16] '; curl -s -w "$L" "$API/api/partner/nada"
printf '[17] '; curl -s -w "$L" -X DELETE "$API/api/partner/events"
printf '[18] '; curl -s -w "$L" "$API/api/partner"
printf '[19] '; curl -s -w "$L" -X PUT "$API/api/partner/tickets/$K" -H "Content-Type: application/json" -d '{"status":"confirmed"}'
printf '[20] '; curl -s -w "$L" -H "X-Api-Key: $KEY" "$API/api/partner/nada"
printf '[21] '; curl -s -w "$L" -X DELETE -H "X-Api-Key: $KEY" "$API/api/partner/events"
printf '[22] '; curl -s -o /dev/null -w '%{http_code} %{content_type}\n' -H "x-api-key: $KEY" "$API/api/partner/events"
echo "$N0 $(sql "SELECT count(*) FROM tickets")"
ocupadas "$E"
ingresso "$K" | mascara
```

Esperado:
- `<E> <X>`; `{"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8` (E fica sem vaga, com um ingresso pendente `<K>`); `c09x`: `302` e `location: /organizador/eventos/<X>?ok=cancelado`.
- De `[1]` a `[19]`, exatamente uma linha cada: `[<n>] {"error":"unauthorized"} 401 application/json; charset=utf-8`. Ou seja: as três rotas sem o cabeçalho e com chave errada (passo 16 do brief, `[1]`–`[6]`, inclusive sobre um ingresso que existe e um evento sem vaga); chave vazia, em maiúsculas, com sufixo, só no `Authorization` ou só na query (`[7]`–`[11]`); sem chave ou com chave errada, mesmo com JSON malformado em evento inexistente, cartão inválido em evento cancelado, `Content-Type: text/plain` ou ingresso inexistente — a chave vem antes de `422`, `404` e `409` (`[12]`–`[15]`); qualquer caminho ou método sob `/api/partner`, inclusive inexistentes (`[16]`–`[19]`).
- `[20] {"error":"not_found"} 404 application/json; charset=utf-8` e `[21] {"error":"not_found"} 404 application/json; charset=utf-8` (com a chave, caminho e método desconhecidos).
- `[22] 200 application/json; charset=utf-8` (o nome do cabeçalho não diferencia maiúsculas).
- `<N0> <N0>` (nenhuma requisição sem chave criou ingresso); `1|1`.
- `{"ticketId":"<tkt>","code":"<código>","eventId":"<E>","status":"pending","checkedIn":false} 200 application/json; charset=utf-8` (o `PUT` sem chave não mudou nada).

#### C10 — Passos 4–8 pela API: `availableSeats` acompanha as vagas; `…0004` pendente aos 29 s e recusado até 45 s; `…0001` confirmado em até 5 s

```bash
. /tmp/catraca-f07/aux.sh
E1=$(evento 2 '100,00'); echo "$E1"
listar "$T/c10a.json"; vagas "$T/c10a.json" "$E1"
compra --evento "$E1" --cartao 4000000000000001 --conta participante@catraca.test > "$T/c10v.txt"; V=$(tkt "$T/c10v.txt"); head -n 1 "$T/c10v.txt"
aos "$V" 6
listar "$T/c10b.json"; vagas "$T/c10b.json" "$E1"
curl -s -w "$L" -X POST "$API/api/partner/events/$E1/purchases" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"buyerEmail":"t2@example.com","cardNumber":"4000000000000004"}' > "$T/c10t2.txt"
mascara < "$T/c10t2.txt"
T2=$(tkt "$T/c10t2.txt"); C2=$(cod "$T/c10t2.txt"); echo "$T2 $C2"
listar "$T/c10c.json"; vagas "$T/c10c.json" "$E1"
curl -s -w "$L" -X POST "$API/api/partner/events/$E1/purchases" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"buyerEmail":"t3@example.com","cardNumber":"4000000000000001"}'
sql "SELECT EXTRACT(EPOCH FROM clock_timestamp() - created_at) < 30 FROM tickets WHERE id = '$T2'"
aos "$T2" 29
listar "$T/c10d.json"; vagas "$T/c10d.json" "$E1"
aos "$T2" 45
janela "$T2" 30 40
curl -s -w "$L" -H "X-Api-Key: $KEY" "$API/api/partner/tickets/$T2"
listar "$T/c10e.json"; vagas "$T/c10e.json" "$E1"
curl -s -w "$L" -X POST "$API/api/partner/events/$E1/purchases" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"buyerEmail":"t3@example.com","cardNumber":"4000000000000001"}' > "$T/c10t3.txt"
mascara < "$T/c10t3.txt"
T3=$(tkt "$T/c10t3.txt"); C3=$(cod "$T/c10t3.txt"); echo "$T3 $C3"
aos "$T3" 5
janela "$T3" 2 5
curl -s -w "$L" -H "X-Api-Key: $KEY" "$API/api/partner/tickets/$T3"
listar "$T/c10f.json"; vagas "$T/c10f.json" "$E1"
ocupadas "$E1"
```

Esperado:
- `<E1>`; `200 application/json; charset=utf-8` e `2` (passo 4: lotação 2, nenhuma compra).
- `simulando 1 compra(s) simultânea(s) no evento <E1> pelo canal vitrine` (o confirmado do passo 5, comprado pelo canal da vitrine).
- `confirmed|<x>` com x ≥ 6,0 (a consulta da API mostra o ingresso da vitrine confirmado).
- `200 application/json; charset=utf-8` e `1`.
- `{"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8` (passo 6); `<T2> <C2>`.
- `200 application/json; charset=utf-8` e `0` (o pendente ocupa a última vaga).
- `{"error":"sold_out"} 409 application/json; charset=utf-8` e `t` (passo 7: a compra seguinte, antes de completar 30 s do passo 6, é recusada por falta de vaga).
- `pending|<x>` com x ≥ 29,0 (T2 continua pendente aos 29 s); `200 application/json; charset=utf-8` e `0` (e continua ocupando a vaga).
- `declined|<x>` com x ≥ 45,0 (passo 8: aos 45 s T2 está recusado); `declined|<s>|dentro` (a recusa aconteceu entre 30 e 40 s depois da compra).
- Exatamente `{"ticketId":"<T2>","code":"<C2>","eventId":"<E1>","status":"declined","checkedIn":false} 200 application/json; charset=utf-8`.
- `200 application/json; charset=utf-8` e `1` (a recusa devolveu a vaga).
- `{"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8` (T3); `<T3> <C3>`.
- `confirmed|<x>` com x ≥ 5,0 (aos 5 s T3 está confirmado) e `confirmed|<s>|dentro` (confirmado entre 2 e 5 s depois da compra).
- Exatamente `{"ticketId":"<T3>","code":"<C3>","eventId":"<E1>","status":"confirmed","checkedIn":false} 200 application/json; charset=utf-8`.
- `200 application/json; charset=utf-8` e `0`; `2|3` (2 ocupando vaga: o da vitrine e T3; 3 ingressos no total: a compra recusada com `409` não criou ingresso).

#### C11 — CF13: ingressos da API no cancelamento — `refunded` e `cancelled` em até 10 s, `cancelled` continua depois de 45 s

```bash
. /tmp/catraca-f07/aux.sh
E3=$(evento 5 '50,00'); echo "$E3"
curl -s -w "$L" -X POST "$API/api/partner/events/$E3/purchases" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"buyerEmail":"t5@example.com","cardNumber":"4000000000000003"}' > "$T/c11t5.txt"
curl -s -w "$L" -X POST "$API/api/partner/events/$E3/purchases" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"buyerEmail":"t6@example.com","cardNumber":"4000000000000001"}' > "$T/c11t6.txt"
mascara < "$T/c11t5.txt"; mascara < "$T/c11t6.txt"
T5=$(tkt "$T/c11t5.txt"); C5=$(cod "$T/c11t5.txt"); T6=$(tkt "$T/c11t6.txt"); C6=$(cod "$T/c11t6.txt"); echo "$T5 $C5 $T6 $C6"
aos "$T6" 6
sql "SELECT EXTRACT(EPOCH FROM clock_timestamp() - created_at) < 30 FROM tickets WHERE id = '$T5'"
cancelar c11x "$E3"
listar "$T/c11.json"; js item "$T/c11.json" "$E3"
curl -s -w "$L" -X POST "$API/api/partner/events/$E3/purchases" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"buyerEmail":"t7@example.com","cardNumber":"4000000000000001"}'
curl -s -w "$L" -H "X-Api-Key: $KEY" "$API/api/partner/tickets/$T6"
curl -s -w "$L" -H "X-Api-Key: $KEY" "$API/api/partner/tickets/$T5"
sql "SELECT EXTRACT(EPOCH FROM clock_timestamp() - cancelled_at) <= 10 FROM events WHERE id = '$E3'"
aos "$T5" 46
curl -s -w "$L" -H "X-Api-Key: $KEY" "$API/api/partner/tickets/$T5"
ocupadas "$E3"
```

Esperado:
- `<E3>`; duas linhas `{"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8`; `<T5> <C5> <T6> <C6>`.
- `confirmed|<x>` com x ≥ 6,0 (T6 confirmado, como no passo 12 do brief).
- `t` (o cancelamento a seguir acontece antes de completar 30 s da compra de T5).
- `c11x`: `302` e `location: /organizador/eventos/<E3>?ok=cancelado`.
- `200 application/json; charset=utf-8` e `ausente` (passo 13: E3 sai da listagem).
- `{"error":"event_not_available"} 404 application/json; charset=utf-8` (passo 13: a compra de E3 é recusada).
- Exatamente `{"ticketId":"<T6>","code":"<C6>","eventId":"<E3>","status":"refunded","checkedIn":false} 200 application/json; charset=utf-8` e `{"ticketId":"<T5>","code":"<C5>","eventId":"<E3>","status":"cancelled","checkedIn":false} 200 application/json; charset=utf-8`.
- `t` (essas consultas aconteceram a menos de 10 s do cancelamento).
- `cancelled|<x>` com x ≥ 46,0 e, de novo, exatamente `{"ticketId":"<T5>","code":"<C5>","eventId":"<E3>","status":"cancelled","checkedIn":false} 200 application/json; charset=utf-8` (passo 14: depois que o gateway respondeu, T5 continua `cancelled`).
- `0|2`.

#### C12 — F07-CA11: clone limpo, sem `.env` e sem chave de pagamento, compra pela API com `…0001` fica `confirmed` em até 5 s

O clone sobe num projeto do Compose e numa porta próprios (`catraca-f07-limpo`, `3077`), passados só ao Compose pelas variáveis `COMPOSE_PROJECT_NAME` e `CATRACA_PORT` documentadas no README para ambientes paralelos — elas não chegam à aplicação —, para não derrubar nem colidir com o ambiente da avaliação. Se a porta 3077 estiver ocupada (primeira verificação diferente de `000`/`curl_exit=7`), troque `PL=3077` por outra porta livre e repita.

```bash
(
. /tmp/catraca-f07/aux.sh
WEB0=$WEB
CL=/tmp/catraca-f07-limpo-$U; PL=3077
curl -s -o /dev/null -w '%{http_code}\n' --max-time 3 "http://localhost:$PL/"; echo "curl_exit=$?"
docker ps -a --filter label=com.docker.compose.project=catraca-f07-limpo --format '{{.Names}}' | wc -l
git clone --quiet "$REPO" "$CL" && cd "$CL" && git checkout --quiet --detach "$COMMIT"
git rev-parse HEAD; git status --porcelain | wc -l
test -e .env && echo "tem .env" || echo "sem .env"
unset PARTNER_API_KEY GATEWAY_MODE GATEWAY_DELAY_SCALE SESSION_SECRET LOG_LEVEL
export COMPOSE_PROJECT_NAME=catraca-f07-limpo CATRACA_PORT=$PL
npm run up > "$T/c12-up.txt" 2>&1; echo "exit=$?"
grep -cE '^\[up\] Catraca no ar\.$' "$T/c12-up.txt"
WEB=http://localhost:$PL; API=$WEB; JAR=$T/l.jar
curl -s -w "$L" "$WEB/health"
docker compose exec -T app printenv < /dev/null | grep -ciE '^(GATEWAY_|PARTNER_API_KEY=|[A-Z_]*(PAYMENT|PAGAMENTO)[A-Z_]*=)'
docker compose exec -T app catraca config < /dev/null | grep -E '^(GATEWAY_MODE|GATEWAY_DELAY_SCALE|PARTNER_API_KEY)='
entrar l "$JAR" organizador.a@catraca.test
E=$(evento 5 '100,00'); echo "$E"
listar "$T/c12.json"; vagas "$T/c12.json" "$E"
curl -s -w "$L" -X POST "$API/api/partner/events/$E/purchases" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"buyerEmail":"limpo@example.com","cardNumber":"4000000000000001"}' > "$T/c12c.txt"
mascara < "$T/c12c.txt"
K=$(tkt "$T/c12c.txt")
aos "$K" 5
janela "$K" 2 5
curl -s -w "$L" -H "X-Api-Key: $KEY" "$API/api/partner/tickets/$K" | mascara
npm run down > "$T/c12-down.txt" 2>&1; echo "exit=$?"
docker volume rm catraca-f07-limpo_db-data
docker ps -a --filter label=com.docker.compose.project=catraca-f07-limpo --format '{{.Names}}' | wc -l
cd /tmp && rm -rf "$CL"
curl -s -w "$L" "$WEB0/health"
)
```

Esperado:
- `000` e `curl_exit=7` (a porta do clone está livre); `0` (nenhum container do projeto do clone).
- O hash `<COMMIT>`; `0` (clone limpo); `sem .env`.
- `exit=0` e `1` (o `npm run up` do clone terminou com `[up] Catraca no ar.`).
- `{"status":"ok"} 200 application/json; charset=utf-8`.
- `0` (o container da aplicação do clone não tem nenhuma variável de gateway, de chave de parceiro ou de pagamento).
- Exatamente `GATEWAY_MODE=simulado`, `GATEWAY_DELAY_SCALE=1` e `PARTNER_API_KEY=parceiro-catraca-dev` (tudo pelo padrão).
- `l`: `302`, `location: /organizador` e `set-cookie: catraca_sessao=…`; `<E>`; `200 application/json; charset=utf-8` e `5`.
- `{"ticketId":"<tkt>","code":"<código>","status":"pending"} 202 application/json; charset=utf-8`.
- `confirmed|<x>` com x ≥ 5,0 e `confirmed|<s>|dentro` (confirmado entre 2 e 5 s depois da compra).
- `{"ticketId":"<tkt>","code":"<código>","eventId":"<E>","status":"confirmed","checkedIn":false} 200 application/json; charset=utf-8`.
- `exit=0`; `catraca-f07-limpo_db-data`; `0` (nada do clone ficou para trás).
- `{"status":"ok"} 200 application/json; charset=utf-8` (o ambiente da avaliação continua no ar).

#### C13 — Testes da F07 passam nos gates (inclusive a rajada por HTTP real em 5 rodadas)

```bash
. /tmp/catraca-f07/aux.sh
grep -hoE 'F07-CA[0-9]{2}|CF1[0-3]' app/test/f07/*.test.ts | sort -u | tr '\n' ' '; echo
grep -c 'F07-CA07' app/test/f07/rajada.test.ts
npm run gates -- test/f07 > "$T/c13.txt" 2>&1; echo "exit=$?"
grep -E '^\[gates\] ' "$T/c13.txt"
```

Esperado:
- Exatamente `CF10 CF11 CF12 CF13 F07-CA01 F07-CA02 F07-CA03 F07-CA04 F07-CA05 F07-CA06 F07-CA07 F07-CA08 F07-CA09 F07-CA10 F07-CA11 ` (todos os critérios da F07 têm teste com o ID no nome); um número ≥ 1.
- `exit=0`.
- Entre as linhas `[gates] …` (além da linha do projeto Compose dos gates): `[gates] lint: ok`, `[gates] typecheck: ok`, `[gates] testes: ok (N executados, 0 falharam) [filtro: test/f07]` com `N` ≥ 30 e `[gates] resultado: OK` (inclusive as rajadas de 30 compras por HTTP real em lotação 5, repetidas em 5 eventos novos, e a rajada mista API + canal vitrine).

### Encerramento (depois do C13)

```bash
rm -rf /tmp/catraca-f07 /tmp/catraca-f07-limpo-*
```

Sem veredito. O `npm run down` final é feito pela skill de avaliação.

## 3. Mapeamento critério → itens

| Critério (PRD) | Itens |
|----------------|-------|
| F07-CA01 | C01 |
| F07-CA02 | C02, C03 |
| F07-CA03 | C03, C06 |
| F07-CA04 | C04, C11 |
| F07-CA05 | C05, C10 |
| F07-CA06 | C06 |
| F07-CA07 | C07, C13 |
| F07-CA08 | C08, C10 |
| F07-CA09 | C09 |
| F07-CA10 | C10 |
| F07-CA11 | C12 |
| CF10 (F04 → F07) | C01, C04 |
| CF11 (F05 → F07) | C10 |
| CF12 (F05 → F07) | C07, C13 |
| CF13 (F05 → F07) | C11 |

Notas do mapeamento:
- **F07-CA01 e CF10:** C01 cria os eventos pela página de gestão da F04: rascunho fora da listagem, publicado com `priceCents` 10000 (R$ 100,00) e, depois da edição para R$ 150,00, 15000 (R03), cancelado fora (R11); `availableSeats` = lotação − pendentes − confirmados (R05), conferido para toda a listagem contra o banco. C04 cobre a outra metade do CF10: compra de evento cancelado → `404 event_not_available`.
- **F07-CA07 e CF12 / R07:** C07 roda o comando exato do passo 15 do brief em 3 rodadas, cada uma num evento novo de lotação 5 (o critério pede duas; a skill de contrato pede ao menos três); passa só com exatamente 5 × `202` e 25 × `409` em todas, com 5 ingressos (vagas ocupadas em 5) e `availableSeats` 0. C13 roda os testes da F07, que repetem a rajada por HTTP real em 5 rodadas, em dois eventos ao mesmo tempo e misturada com compras pelo canal da vitrine.
- **F07-CA08:** C08 confere os cinco campos exatos, `checkedIn` falso num ingresso novo e verdadeiro depois do check-in (marcado direto no banco, porque o check-in é da F08, paralela), o ingresso "comprado pela vitrine" (canal `vitrine` do serviço da F05, pelo `compra:simular --conta`, porque a vitrine é da F06, paralela) e o `404 ticket_not_found`. C10 também consulta pela API um ingresso do canal `vitrine`.
- **F07-CA10 e CF11 (R05, R07, R08):** C10 reproduz pela API os passos 4 a 8 do Fluxo do avaliador: lotação 2 com 1 confirmado, compra `…0004` leva `availableSeats` a 0, a compra seguinte (antes de 30 s) a `409 sold_out`, a consulta mostra `pending` aos 29 s e `declined` aos 45 s, `availableSeats` volta a 1, e uma compra `…0001` aparece `confirmed` aos 5 s. As idades são medidas no relógio do banco; a função `janela` mostra que a mudança aconteceu dentro das faixas do gateway.
- **F07-CA05:** C05 (lotado com confirmado e com pendente) e C10 (passo 7).
- **F07-CA06:** C06 percorre a matriz da ordem do brief; C09 completa com a chave antes de tudo.
- **CF13 e F07-CA04 (R11):** C11 reproduz os passos 12 a 14 pela API: cancelado pela página de gestão antes de 30 s da compra `…0003`, o evento sai da listagem, a compra responde `404`, a consulta mostra `refunded` para o confirmado e `cancelled` para o pendente a menos de 10 s do cancelamento, e o pendente continua `cancelled` aos 46 s, depois da resposta do gateway.
- **F07-CA11:** C12 sobe o commit avaliado num clone limpo, sem `.env` e sem nenhuma variável de gateway, chave de parceiro ou pagamento na aplicação, e compra pela API com `…0001`: `confirmed` aos 5 s.

## 4. Fora deste contrato

- **CF19 (F06, F07 → F09) e CF20 (F07, F08 → F09):** vendas da API no painel e check-in de ingresso da API com `"checkedIn":true` pelo check-in real — contrato da F09, a feature envolvida implementada por último. Aqui, `checkedIn` verdadeiro é conferido com o check-in marcado no banco (C08).
- **Vitrine, "Meus ingressos", `Ingressos esgotados`** (F06) e **check-in** (F08): features da mesma wave; nenhum item as usa.
- **Serviço de compra, garantia de R07 em si, tempos do gateway e efeitos do cancelamento nos ingressos:** contratos da F05 e da F03 (aqui verificados só como chegam pela API). **Criação, publicação, edição, cancelamento e isolamento de eventos:** contrato da F04 (aqui a F04 é só a superfície que prepara os cenários).
- **Detalhes de implementação cobertos só pelos testes da F07 (C13 e G1):** troca da chave pela variável `PARTNER_API_KEY`, comparação em tempo constante, limite de 16 KiB do corpo, `cache-control: no-store`, ids com mais de 100 caracteres, `HEAD`/`OPTIONS`, logs sem a chave.
- Cadastro de parceiros, várias chaves, rotação de chave, webhooks e qualquer rota além das três: fora de escopo do PRD.

## 5. Alterações do contrato

Nenhuma.
