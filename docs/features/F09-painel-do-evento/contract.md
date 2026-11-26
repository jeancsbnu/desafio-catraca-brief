# Contrato: F09 — Painel do evento

## 1. Pré-requisitos de ambiente

- **Commit avaliado:** o avaliador registra o hash no relatório (`git rev-parse HEAD` na raiz do repositório avaliado — `main`, branch ou worktree da F09).
- **Onde roda:** na raiz da pasta do repositório avaliado, num shell `bash` (Linux, macOS ou WSL). Cada bloco do roteiro começa com `. /tmp/catraca-f09/aux.sh` (criado na Preparação), que entra na raiz do repositório e define variáveis e funções; por isso os blocos podem rodar em shells separados.
- **Subir:** `npm run up` · **Derrubar:** `npm run down` · **Gates:** `npm run gates` (comandos do `AGENTS.md`; nenhum `npm install`). Conforme a skill `evaluate-feature`, o avaliador roda `npm run down` e `npm run up` antes da Preparação.
- **Endereços:** `$WEB` = `$API` = `http://localhost:3000`; se a pasta avaliada tiver um `.env` com `CATRACA_PORT`, a Preparação usa essa porta. **Chave de parceiro:** `$KEY` = `parceiro-catraca-dev` (README, seção "Credenciais").
- **Contas da seed:** organizador A (`organizador.a@catraca.test`), organizador B (`organizador.b@catraca.test`), participante (`participante@catraca.test`); senha `catraca123` para as três, conforme o README. A Preparação cria também, pela interface (`/cadastro`), uma conta de participante nova, `participante.f09.<U>@example.com` (como no passo 5 do Fluxo do avaliador), usada nas compras pela vitrine.
- **Modo:** padrão — gateway simulado com os **tempos reais do brief** (`…0001` aprovado em 2–5 s, `…0003` em 30–40 s, `…0004` recusado em 30–40 s, `…0002` recusado em 2–5 s). Nenhuma variável `GATEWAY_*` no shell nem no `.env`; um `.env` local só é aceito com `CATRACA_PORT` e/ou `COMPOSE_PROJECT_NAME` (conferido na Preparação).
- **Superfícies usadas (todas já integradas quando a F09 é avaliada — Wave 6):** página de gestão e formulários da F04 (criar, publicar, editar e cancelar eventos, com o cookie do organizador); cadastro e login da F02; compra pela vitrine da F06 (`POST /eventos/{id}/comprar`, campo `cartao`); API de parceiros da F07 (contrato fixo do brief); check-in da F08 (`POST /organizador/eventos/{id}/checkin`, campo `codigo`); a seção "Painel" da F09 na página de gestão; consultas SQL de leitura no container `db` (só para ids e evidência); `npm run gates`.
- **Como o painel é lido:** a função `painel` abre a página de gestão e imprime, numa linha, os seis pares rótulo/valor da seção `data-secao="painel"` (pares `<dt>rótulo</dt><dd data-metrica="chave">valor</dd>`), por exemplo `Confirmados 3 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 350,00 | Estornados 0`. Caracteres fora de ASCII e das letras acentuadas aparecem como `<U+XXXX>` (um espaço não separável depois de `R$` apareceria como `R$<U+00A0>350,00` e reprova o item). Sem a seção, imprime `painel: ausente`; com status diferente de `200`, imprime antes `HTTP <status>`.
- **Como medir tempo:** esperas pelo gateway usam o relógio do banco (`idade`: espera o ingresso completar N segundos desde a criação); os limites "em até 10 s" são conferidos no relógio do banco logo depois da observação do painel.
- **Ferramentas do avaliador:** `bash`, `git`, `curl`, `awk`, `sed`, `grep`, `sort`, `uniq`, `seq`, `xargs`, `cut`, `paste`, `docker` com Compose v2, `node` (LTS), `npm`. Navegador só para o roteiro opcional (2.2).
- **Datas:** a Preparação calcula `PROX` = dia 15 do mês seguinte, 21:00 (`AAAA-MM-DDTHH:MM`, fuso `America/Sao_Paulo`), usada em todos os eventos.
- **Ordem e dados:** os itens rodam na ordem numérica. Cada item cria os próprios eventos (função `evento`, nomes `Evento F09 <U>-<n>`, sufixo `$U` único por avaliação) e as próprias compras, e não depende de outro item — exceto o C04, que declara `Depende de: C03` (continua o evento E1 do Fluxo). Dados criados: eventos dos organizadores A e B, ingressos pela vitrine (conta nova) e pela API, tentativas de pagamento, marcações de check-in e uma conta de participante. Nenhuma escrita fora das superfícies do produto.
- **Duração:** cerca de 6 minutos para C01–C10 (C03 espera cerca de 45 s pelo `…0004`; C07 espera até 46 s da compra `…0003`), mais o C11, que roda os gates filtrados e pode levar alguns minutos — use um tempo-limite de pelo menos 10 minutos para esse comando.

### Preparação (antes do C01)

```bash
# na raiz do repositório avaliado, com o ambiente já subido por npm run up
git status --porcelain | wc -l
git rev-parse HEAD
env | grep -c '^GATEWAY_'
if [ -e .env ]; then grep -vE '^[[:space:]]*(#|$)' .env | grep -cvE '^(CATRACA_PORT|COMPOSE_PROJECT_NAME)='; else echo "sem .env"; fi
mkdir -p /tmp/catraca-f09 && rm -rf /tmp/catraca-f09/*
printf "cd '%s'\n" "$(git rev-parse --show-toplevel)" > /tmp/catraca-f09/aux.sh
printf 'U=%s\n' "$(date +%s)" >> /tmp/catraca-f09/aux.sh
TZ=America/Sao_Paulo node -e '
const p = (n) => String(n).padStart(2, "0");
const h = new Date();
const a = new Date(h.getFullYear(), h.getMonth() + 1, 15);
console.log(`PROX=${a.getFullYear()}-${p(a.getMonth() + 1)}-${p(a.getDate())}T21:00`);
' >> /tmp/catraca-f09/aux.sh
cat >> /tmp/catraca-f09/aux.sh <<'EOF'
T=/tmp/catraca-f09
PORTA=${CATRACA_PORT:-$(sed -n 's/^CATRACA_PORT=//p' .env 2>/dev/null | tail -n 1)}
WEB=http://localhost:${PORTA:-3000}
API=$WEB
KEY=parceiro-catraca-dev
# req <id> [opções do curl] <url>: imprime o status HTTP e as linhas location/set-cookie; corpo em $T/<id>.html
req() { _id=$1; shift; curl -s -o "$T/$_id.html" -D "$T/$_id.h" -w '%{http_code}\n' "$@"; tr -d '\r' < "$T/$_id.h" | awk '{ i = index($0, ":"); n = tolower(substr($0, 1, i - 1)); if (n == "location" || n == "set-cookie") print n ":" substr($0, i + 1) }'; }
# conta <id> <texto>: ocorrências do texto no corpo guardado
conta() { grep -oF -- "$2" "$T/$1.html" | wc -l | tr -d ' '; }
# tem / naotem <id> <texto>...: presença ou ausência de cada texto no corpo guardado
tem() { _id=$1; shift; for s in "$@"; do grep -qF -- "$s" "$T/$_id.html" && echo "ok: $s" || echo "FALTA: $s"; done; }
naotem() { _id=$1; shift; for s in "$@"; do grep -qF -- "$s" "$T/$_id.html" && echo "INDEVIDO: $s" || echo "ausente: $s"; done; }
sql() { docker compose exec -T db psql -U catraca -d catraca -At -c "$1" < /dev/null; }
entrar() { req "$1" -c "$2" -b "$2" --data-urlencode "email=$3" --data-urlencode "senha=catraca123" "$WEB/entrar"; }
# evento <lotação> <preço> [rascunho|publicado] [cookie jar]: cria um evento novo pela F04 (organizador A por padrão) e publica, salvo "rascunho"; imprime o id
evento() {
  _j=${4:-$T/a.jar}
  _k=$(( $(cat "$T/k" 2>/dev/null || echo 0) + 1 )); echo "$_k" > "$T/k"
  _s=$(req "ev$_k" -b "$_j" --data-urlencode "nome=Evento F09 $U-$_k" --data-urlencode "inicio=$PROX" --data-urlencode "local=Local F09 $U" --data-urlencode "lotacao=$1" --data-urlencode "preco=$2" "$WEB/organizador/eventos" | head -n 1)
  _e=$(tr -d '\r' < "$T/ev$_k.h" | sed -n 's|^[Ll]ocation: /organizador/eventos/\(evt_[a-z0-9]\{16\}\)?ok=criado$|\1|p')
  if [ "$_s" != 302 ] || [ -z "$_e" ]; then echo "FALHA: criar evento respondeu $_s" >&2; return 1; fi
  if [ "${3:-publicado}" != rascunho ]; then
    _s=$(req "pu$_k" -b "$_j" -X POST "$WEB/organizador/eventos/$_e/publicar" | head -n 1)
    if [ "$_s" != 302 ]; then echo "FALHA: publicar respondeu $_s" >&2; return 1; fi
  fi
  echo "$_e"
}
# editar <id> <evento> <lotação> <preço>: POST de edição da F04 (organizador A) mantendo nome, data e local
editar() { _n=$(sql "SELECT name FROM events WHERE id = '$2'"); req "$1" -b "$T/a.jar" --data-urlencode "nome=$_n" --data-urlencode "inicio=$PROX" --data-urlencode "local=Local F09 $U" --data-urlencode "lotacao=$3" --data-urlencode "preco=$4" "$WEB/organizador/eventos/$2/editar"; }
# cancelar <id> <evento>: cancelamento confirmado pela F04 (organizador A)
cancelar() { req "$1" -b "$T/a.jar" --data-urlencode 'confirmar=sim' "$WEB/organizador/eventos/$2/cancelar"; }
# painel <id> <evento> [cookie jar]: abre a página de gestão (organizador A por padrão) e imprime a linha do painel
painel() { _ps=$(req "$1" -b "${3:-$T/a.jar}" "$WEB/organizador/eventos/$2" | head -n 1); [ "$_ps" = 200 ] || echo "HTTP $_ps"; node "$T/painel.js" "$T/$1.html"; }
# lerpainel <id>: linha do painel de uma página já guardada (ex.: a resposta do check-in)
lerpainel() { node "$T/painel.js" "$T/$1.html"; }
# estrutura <id>: título, rótulos, chaves, receita em centavos, espaços especiais e posição da seção na página guardada
estrutura() { node "$T/painel.js" "$T/$1.html" estrutura; }
# espera_painel <id> <evento> <linha esperada> <s>: recarrega a página a cada 0,5 s até o painel mostrar a linha (no máximo 2×<s> tentativas); imprime a última linha vista
espera_painel() { _i=0; while :; do _l=$(painel "$1" "$2"); [ "$_l" = "$3" ] && break; _i=$((_i + 1)); [ "$_i" -ge $(( $4 * 2 )) ] && break; sleep 0.5; done; echo "$_l"; }
# api_comprar <id> <evento> <cartão> [e-mail]: compra pela API de parceiros; imprime "<status> <corpo>" (corpo em $T/<id>.json)
api_comprar() { _as=$(curl -s -o "$T/$1.json" -w '%{http_code}' -X POST "$API/api/partner/events/$2/purchases" -H "X-Api-Key: $KEY" -H 'Content-Type: application/json' -d "{\"buyerEmail\":\"${4:-f09.$U.$1@example.com}\",\"cardNumber\":\"$3\"}"); echo "$_as $(cat "$T/$1.json")"; }
# jcampo <id> <campo>: valor de um campo do JSON guardado por api_comprar
jcampo() { node -e 'try { const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const v = j[process.argv[2]]; console.log(v === undefined ? "" : String(v)); } catch (e) { console.log(""); }' "$T/$1.json" "$2"; }
# api_ingresso <tkt>: GET /api/partner/tickets/<tkt>; imprime "<status HTTP> ticketId|code|eventId|status|checkedIn" (corpo em $T/ing.json)
api_ingresso() { _is=$(curl -s -o "$T/ing.json" -w '%{http_code}' -H "X-Api-Key: $KEY" "$API/api/partner/tickets/$1"); echo "$_is $(node -e 'try { const j = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log([j.ticketId, j.code, j.eventId, j.status, j.checkedIn].join("|")); } catch (e) { console.log("JSON inválido"); }' "$T/ing.json")"; }
# espera <tkt> <status> <s>: consulta o ingresso pela API a cada 0,5 s até ter o status (no máximo 2×<s> tentativas); imprime a última consulta
espera() { _i=0; while :; do _r=$(api_ingresso "$1"); [ "$(echo "$_r" | cut -d'|' -f4)" = "$2" ] && break; _i=$((_i + 1)); [ "$_i" -ge $(( $3 * 2 )) ] && break; sleep 0.5; done; echo "$_r"; }
# idade <tkt> <s>: espera o ingresso completar <s> segundos desde a criação (relógio do banco) e imprime status|idade
idade() { _r=$(sql "SELECT greatest(0, $2 - EXTRACT(EPOCH FROM clock_timestamp() - created_at)) FROM tickets WHERE id = '$1'"); sleep "${_r:-0}"; sql "SELECT status, round(EXTRACT(EPOCH FROM clock_timestamp() - created_at)::numeric, 1) FROM tickets WHERE id = '$1'"; }
# r10 <id>: mensagens de R10 presentes no corpo guardado, na ordem de R10
r10() { _m=""; for _t in 'Ingresso inválido para este evento' 'Evento cancelado' 'Ingresso não confirmado' 'Ingresso já utilizado' 'Entrada liberada'; do grep -qF -- "$_t" "$T/$1.html" && _m="$_m${_m:+ + }$_t"; done; echo "mensagens: ${_m:-nenhuma}"; }
# checkin <id> <evento> <código> [cookie jar]: POST /organizador/eventos/<evento>/checkin (F08) com o campo codigo (organizador A por padrão); imprime "<status> | mensagens: …"
checkin() { _cs=$(req "$1" -b "${4:-$T/a.jar}" --data-urlencode "codigo=$3" "$WEB/organizador/eventos/$2/checkin" | head -n 1); echo "$_cs | $(r10 "$1")"; }
# vitrine <id> <evento> <cartão>: a conta de participante nova compra pela vitrine (POST /eventos/<evento>/comprar, F06); imprime status, location, a contagem de ingressos da vitrine no evento antes -> depois e o último ("<tkt> <código>", também em $T/<id>.ticket)
vitrine() {
  _v0=$(sql "SELECT count(*) FROM tickets WHERE event_id = '$2' AND channel = 'vitrine'")
  _vr=$(req "$1" -b "$T/p.jar" --data-urlencode "cartao=$3" "$WEB/eventos/$2/comprar" | tr '\n' ' ')
  _v1=$(sql "SELECT count(*) FROM tickets WHERE event_id = '$2' AND channel = 'vitrine'")
  sql "SELECT id || ' ' || code FROM tickets WHERE event_id = '$2' AND channel = 'vitrine' ORDER BY created_at DESC, id DESC LIMIT 1" > "$T/$1.ticket"
  echo "${_vr}| vitrine no evento: $_v0 -> $_v1 | $(cat "$T/$1.ticket")"
}
EOF
cat > /tmp/catraca-f09/painel.js <<'EOF'
// painel.js <página.html> [estrutura]: números do painel (F09) numa página de gestão salva.
const fs = require('fs');
const [arquivo, modo] = process.argv.slice(2);
const s = fs.readFileSync(arquivo, 'utf8');
const aberturas = [...s.matchAll(/<section\b[^>]*\bdata-secao="painel"[^>]*>/g)];
if (aberturas.length === 0) { console.log('painel: ausente'); process.exit(0); }
const ini = aberturas[0].index;
const fim = s.indexOf('</section>', ini);
const sec = s.slice(ini, fim < 0 ? s.length : fim);
const re = /<dt>([^<]*)<\/dt><dd data-metrica="([a-z-]+)"(?: data-centavos="([0-9]+)")?>([^<]*)<\/dd>/g;
const itens = [...sec.matchAll(re)].map((m) => ({ rotulo: m[1], chave: m[2], centavos: m[3], valor: m[4] }));
const hex = (c) => c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
const vis = (t) => t.replace(/[^\x20-\x7e\xc0-\xff]/g, (c) => `<U+${hex(c)}>`);
if (modo !== 'estrutura') {
  console.log(itens.length ? itens.map((i) => `${vis(i.rotulo)} ${vis(i.valor)}`).join(' | ') : 'painel: sem números');
  process.exit(0);
}
const especiais = [0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x200b, 0x202f, 0x205f, 0x3000, 0xfeff];
const receita = itens.find((i) => i.chave === 'receita');
const iDados = s.indexOf('<dt>Preço</dt>');
const iCheckin = s.indexOf('data-secao="checkin"');
const iVoltar = s.lastIndexOf('Voltar para meus eventos');
console.log(`seções do painel: ${aberturas.length}`);
console.log(`título: ${sec.includes('<h2>Painel</h2>') ? '<h2>Painel</h2>' : 'ausente'}`);
console.log(`rótulos: ${itens.map((i) => vis(i.rotulo)).join(' | ')}`);
console.log(`chaves: ${itens.map((i) => i.chave).join(' ')}`);
console.log(`receita em centavos: ${receita && receita.centavos !== undefined ? receita.centavos : 'ausente'}`);
console.log(`espaços especiais no painel: ${[...sec].filter((c) => especiais.includes(c.codePointAt(0))).length}`);
console.log(`posição: ${iDados >= 0 && iDados < iCheckin && iCheckin < ini && ini < iVoltar ? 'depois dos dados do evento e do check-in, antes do link de volta' : 'FORA DO LUGAR'}`);
EOF
. /tmp/catraca-f09/aux.sh
sed -n '2,3p' /tmp/catraca-f09/aux.sh
curl -s -w '\n%{http_code}\n' "$WEB/health"
docker compose logs --no-log-prefix app | grep -F '[catraca] módulos:' | tail -n 1
docker compose logs --no-log-prefix app | grep -F '"msg":"gateway: worker iniciado"' | tail -n 1 | grep -cE '"escala":1[,}]'
curl -s -o /dev/null -w '%{http_code}\n' -H "X-Api-Key: $KEY" "$API/api/partner/events"
entrar pa "$T/a.jar" organizador.a@catraca.test
entrar pb "$T/b.jar" organizador.b@catraca.test
entrar ps "$T/ps.jar" participante@catraca.test
req pc -c "$T/p.jar" -b "$T/p.jar" --data-urlencode "nome=Participante F09 $U" --data-urlencode "email=participante.f09.$U@example.com" --data-urlencode "senha=senha-f09-$U" "$WEB/cadastro"
E0=$(evento 1 '1,00'); echo "$E0"
req p0 -b "$T/a.jar" "$WEB/organizador/eventos/$E0" | head -n 1
echo "$(conta p0 "action=\"/organizador/eventos/$E0/checkin\"") $(conta p0 'name="codigo"') $(conta p0 'data-secao="painel"')"
lerpainel p0
req p1 -b "$T/p.jar" "$WEB/eventos/$E0" | head -n 1
echo "$(conta p1 "action=\"/eventos/$E0/comprar\"") $(conta p1 'name="cartao"')"
```

Esperado:
- `0` (árvore limpa); o hash do commit; `0` (nenhuma variável `GATEWAY_*` no shell); `sem .env` ou `0` (o `.env` só tem `CATRACA_PORT`/`COMPOSE_PROJECT_NAME`).
- Duas linhas: `U=<número>` e `PROX=<AAAA-MM>-15T21:00` (mês seguinte ao atual).
- `{"status":"ok"}` e `200`.
- A linha de boot `[catraca] módulos: …` contendo `eventos`, `ingressos` e `painel`, com `painel` depois de `ingressos` (o módulo da F09 carregou depois dos da F04 e da F05).
- `1` (o worker do gateway está no ar com escala 1: os tempos do brief).
- `200` (a API de parceiros da F07 responde com a chave).
- `pa` e `pb`: `302`, `location: /organizador` e uma linha `set-cookie: catraca_sessao=…`; `ps`: `302`, `location: /` e `set-cookie: catraca_sessao=…`.
- `pc` (cadastro da conta nova, F02): `302`, `location: /` e `set-cookie: catraca_sessao=…`.
- `<E0>` no formato `evt_` + 16 caracteres; `200`; `1 1 1` (a página de gestão tem o formulário de check-in da F08 com o campo `codigo` e uma seção do painel).
- `Confirmados 0 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 1 | Receita R$ 0,00 | Estornados 0`.
- `200`; `1 1` (a página do evento na vitrine mostra à conta nova o formulário de compra da F06 com o campo `cartao`).

Sem isso, o contrato não é executável.

**Convenções dos resultados esperados:**
- A saída de `req` (e de `editar`/`cancelar`) é o status na primeira linha e, depois, as linhas `location:`/`set-cookie:`. "Nenhuma outra linha" quer dizer que a resposta não tem `location` nem `set-cookie`.
- `evento` imprime só o id `evt_<16 caracteres [a-z0-9]>`; se imprimir `FALHA: …`, a superfície da F04 falhou e o item é ✗ `não executável`.
- Linhas do painel: `Confirmados <c> | Pendentes <p> | Check-ins <k> | Vagas disponíveis <v> | Receita <R$ …> | Estornados <e>` — comparadas por igualdade exata, caractere a caractere.
- `checkin` imprime `<status> | mensagens: <mensagens de R10 encontradas no corpo, na ordem de R10, separadas por " + ">` (ou `nenhuma`).
- `vitrine` imprime `<status> location: <location> | vitrine no evento: <antes> -> <depois> | <tkt> <código>`.
- `<E>`, `<K>`, `<C>`, `<U>` etc. indicam o valor da variável no momento da execução; `<x>` é um número conferido pela faixa indicada.

## 2. Itens verificáveis

A tabela é o índice. Os comandos exatos e o resultado completo de cada item estão no roteiro 2.1, que prevalece sobre o resumo.

| ID | Item | Tipo | Como verificar (resumo) | Resultado esperado (resumo) | Regras |
|----|------|------|-------------------------|-----------------------------|--------|
| C01 | Painel na página de gestão com os seis rótulos, em rascunho, publicado e cancelado | HTTP | Evento lotação 4 em rascunho; estrutura da seção; linhas exatas do HTML; publicar; cancelar | Uma seção `Painel` com `Confirmados`, `Pendentes`, `Check-ins`, `Vagas disponíveis`, `Receita`, `Estornados` e `data-metrica`, depois dos dados e do check-in; `0/0/0/4/R$ 0,00/0` em rascunho e publicado; `0/0/0/0/R$ 0,00/0` em cancelado | R04, R05, R12 |
| C02 | Receita no formato `R$ 1.234,56`, pelo valor pago | TEMPO | Evento a R$ 617.283,95; duas compras `…0001` pela API; painel depois de cada confirmação | `Receita R$ 617.283,95` e depois `R$ 1.234.567,90`, com espaço comum; `data-centavos` 123456790 | R03, R12 |
| C03 | Fluxo E1 (passos 5 a 9): vitrine + API, pendente, recusa, sold_out, mudança de preço e lotação | TEMPO | E1 lotação 2 a R$ 100,00; compra na vitrine `…0001`; API `…0004` (pendente) e `…0001` (`409`); espera 45 s; API `…0001`; reduzir lotação a 1 (recusado); preço R$ 150,00 e lotação 3; API `…0001` | Painel em cada passo: pendente conta e ocupa vaga sem receita; recusado sai de tudo; mudança de preço não altera a receita anterior; ao final `Confirmados 3 \| Pendentes 0 \| Check-ins 0 \| Vagas disponíveis 0 \| Receita R$ 350,00 \| Estornados 0` | R03, R05, R07, R08, R12 |
| C04 | Fluxo E1 (passo 10): check-ins — **Depende de: C03** | HTTP | Check-in de C1 duas vezes, de C2 e de `ZZZZZZZZ`; painel na resposta e recarregado | `Entrada liberada` → `Check-ins 1` com `Confirmados 3`; `Ingresso já utilizado`, `Ingresso não confirmado`, `Ingresso inválido para este evento` não mudam nenhum número | R10, R12 |
| C05 | CF20: ingresso da API passa no check-in, a API mostra `"checkedIn":true` e o painel `Check-ins 1` | TEMPO | Compra API `…0001`; consulta; check-in; consulta; painel | `Entrada liberada`; `GET /api/partner/tickets/…` com `"checkedIn":true`; `Confirmados 1 \| … \| Check-ins 1 \| …` | R10, R12 |
| C06 | CF19: 1 compra pela vitrine e 2 pela API, a R$ 100,00, contam juntas | TEMPO | Lotação 5; vitrine `…0001` e `…0002`; API `…0001` duas vezes | `Confirmados 3 \| Pendentes 0 \| Check-ins 0 \| Vagas disponíveis 2 \| Receita R$ 300,00 \| Estornados 0`; o recusado da vitrine não conta | R05, R12 |
| C07 | Fluxo E3 (passos 12 a 14): cancelamento com 1 confirmado e 1 pendente | TEMPO | E3 lotação 5 a R$ 50,00; API `…0003` (T5) e `…0001` (T6); cancelar antes de 30 s; painel em até 10 s; espera 46 s; check-in de C6 | Antes: `1/1/0/3/R$ 50,00/0`; depois: `Confirmados 0 \| Pendentes 0 \| Check-ins 0 \| Vagas disponíveis 0 \| Receita R$ 0,00 \| Estornados 1`, igual aos 46 s e depois de `Evento cancelado` | R05, R10, R11, R12 |
| C08 | Check-ins só de confirmados; estornado com check-in sai de Check-ins | TEMPO | Lotação 3: 2 × `…0001` + 1 × `…0004`; check-in do pendente e de um confirmado; cancelar | `Ingresso não confirmado` sem mudar nada; `Entrada liberada` → `2/1/1/0/R$ 20,00/0`; depois do cancelamento `0/0/0/0/R$ 0,00/2`; API: `refunded` com `checkedIn` true | R05, R10, R11, R12 |
| C09 | CF16: painel só para o dono; cada organizador vê só os próprios números | HTTP | Evento de A a R$ 77,00 com 1 confirmado; página aberta por B, pelo participante da seed e sem sessão; evento de B; check-in cruzado | A vê `R$ 77,00`; B `404`, participante `403`, visitante `302` sem nenhum dado do painel; B vê só o próprio painel; código de B no evento de A → `Ingresso inválido para este evento`; `POST` de check-in de B no evento de A → `404`; nenhum número muda | R04, R10, R12, R13 |
| C10 | Fluxo E4/E5 (passo 15): rajada de 30 compras pela API, 3 rodadas, painel em até 10 s | TEMPO | Por rodada: evento novo lotação 5 a R$ 10,00; comando `xargs` do brief; painel logo depois e até mostrar 5 confirmados | `5 202` e `25 409`; logo depois `Confirmados c`, `Pendentes p` com c + p = 5 e `Vagas disponíveis 0`; em até 10 s `Confirmados 5 \| Pendentes 0 \| Check-ins 0 \| Vagas disponíveis 0 \| Receita R$ 50,00 \| Estornados 0` | R05, R07, R12 |
| C11 | Testes da F09 passam nos gates | TEST | `npm run gates -- test/f09` | IDs `F09-CA01`–`F09-CA05` e `CF16`–`CF20` nos nomes dos testes; `exit=0`; `testes: ok (N executados, 0 falharam)` com N ≥ 20 | R12 |

### 2.1 Roteiro detalhado

Todos os comandos rodam a partir da raiz do repositório (o `aux.sh` faz o `cd`).

#### C01 — Painel na página de gestão com os seis rótulos, em rascunho, publicado e cancelado

```bash
. /tmp/catraca-f09/aux.sh
E=$(evento 4 '25,00' rascunho); echo "$E"
req c01a -b "$T/a.jar" "$WEB/organizador/eventos/$E"
estrutura c01a
tem c01a '<h2>Painel</h2>' '<dt>Confirmados</dt><dd data-metrica="confirmados">0</dd>' '<dt>Pendentes</dt><dd data-metrica="pendentes">0</dd>' '<dt>Check-ins</dt><dd data-metrica="check-ins">0</dd>' '<dt>Vagas disponíveis</dt><dd data-metrica="vagas-disponiveis">4</dd>' '<dt>Receita</dt><dd data-metrica="receita" data-centavos="0">R$ 0,00</dd>' '<dt>Estornados</dt><dd data-metrica="estornados">0</dd>'
echo "$(conta c01a 'data-metrica=') $(conta c01a 'data-secao="painel"')"
lerpainel c01a
req c01b -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$E/publicar" | head -n 1
painel c01c "$E"
estrutura c01c | grep -E '^(seções|posição)'
cancelar c01d "$E" | head -n 1
painel c01e "$E"
estrutura c01e | grep -E '^(seções|posição)'
```

Esperado:
- `<E>`; `c01a`: `200` e nenhuma outra linha.
- Exatamente estas 7 linhas:
  ```
  seções do painel: 1
  título: <h2>Painel</h2>
  rótulos: Confirmados | Pendentes | Check-ins | Vagas disponíveis | Receita | Estornados
  chaves: confirmados pendentes check-ins vagas-disponiveis receita estornados
  receita em centavos: 0
  espaços especiais no painel: 0
  posição: depois dos dados do evento e do check-in, antes do link de volta
  ```
- Sete `ok:` (título e as seis linhas exatas do HTML, cada par rótulo/valor numa linha).
- `6 1` (seis números marcados com `data-metrica` na página inteira, uma única seção do painel).
- `Confirmados 0 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 4 | Receita R$ 0,00 | Estornados 0` (rascunho: vagas = lotação).
- `302`; `Confirmados 0 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 4 | Receita R$ 0,00 | Estornados 0` (publicado); `seções do painel: 1` e `posição: depois dos dados do evento e do check-in, antes do link de volta`.
- `302`; `Confirmados 0 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 0,00 | Estornados 0` (cancelado: vagas 0); `seções do painel: 1` e a mesma linha de posição.

#### C02 — Receita no formato `R$ 1.234,56`, pelo valor pago

```bash
. /tmp/catraca-f09/aux.sh
E=$(evento 2 '617283,95'); echo "$E"
api_comprar c02a "$E" 4000000000000001 | cut -d' ' -f1
espera "$(jcampo c02a ticketId)" confirmed 8 | cut -d'|' -f4
painel c02b "$E"
api_comprar c02c "$E" 4000000000000001 | cut -d' ' -f1
espera "$(jcampo c02c ticketId)" confirmed 8 | cut -d'|' -f4
painel c02d "$E"
estrutura c02d | grep -E '^(receita|espaços)'
sql "SELECT price_paid_cents FROM tickets WHERE event_id = '$E' ORDER BY created_at, id"
```

Esperado:
- `<E>`; `202`; `confirmed`.
- `Confirmados 1 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 1 | Receita R$ 617.283,95 | Estornados 0`.
- `202`; `confirmed`.
- `Confirmados 2 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 1.234.567,90 | Estornados 0` (ponto no milhar, vírgula nos centavos, espaço comum depois de `R$`).
- `receita em centavos: 123456790` e `espaços especiais no painel: 0`.
- Exatamente 2 linhas `61728395` (a receita é a soma dos valores pagos).

#### C03 — Fluxo E1 (passos 5 a 9): vitrine + API, pendente, recusa, sold_out, mudança de preço e lotação

```bash
. /tmp/catraca-f09/aux.sh
E1=$(evento 2 '100,00'); echo "$E1"
painel c03a "$E1"
vitrine c03b "$E1" 4000000000000001
K1=$(cut -d' ' -f1 "$T/c03b.ticket"); C1=$(cut -d' ' -f2 "$T/c03b.ticket")
espera "$K1" confirmed 8 | cut -d'|' -f4
painel c03c "$E1"
api_comprar c03d "$E1" 4000000000000004 t2@example.com | cut -d' ' -f1
K2=$(jcampo c03d ticketId); C2=$(jcampo c03d code); echo "$K2 $C2"
painel c03e "$E1"
api_comprar c03f "$E1" 4000000000000001
painel c03g "$E1"
idade "$K2" 45
api_ingresso "$K2" | cut -d'|' -f4
painel c03h "$E1"
api_comprar c03i "$E1" 4000000000000001 | cut -d' ' -f1
espera "$(jcampo c03i ticketId)" confirmed 8 | cut -d'|' -f4
painel c03j "$E1"
editar c03k "$E1" 1 '100,00'
conta c03k 'A lotação não pode ficar menor que as vagas ocupadas'
painel c03l "$E1"
editar c03m "$E1" 3 '150,00'
painel c03n "$E1"
estrutura c03n | grep -E '^receita'
api_comprar c03o "$E1" 4000000000000001 | cut -d' ' -f1
espera "$(jcampo c03o ticketId)" confirmed 8 | cut -d'|' -f4
painel c03p "$E1"
estrutura c03p | grep -E '^receita'
sql "SELECT channel, status, price_paid_cents FROM tickets WHERE event_id = '$E1' ORDER BY created_at, id"
printf 'E1=%s\nK1=%s\nC1=%s\nK2=%s\nC2=%s\n' "$E1" "$K1" "$C1" "$K2" "$C2" > "$T/e1.env"
```

Esperado, nesta ordem:
- `<E1>`; `Confirmados 0 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 2 | Receita R$ 0,00 | Estornados 0`.
- `302 location: /meus-ingressos?ok=compra | vitrine no evento: 0 -> 1 | <K1> <C1>` (compra pela vitrine com a conta nova — passo 5).
- `confirmed`; `Confirmados 1 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 1 | Receita R$ 100,00 | Estornados 0`.
- `202` (passo 6, cartão `…0004`); a linha `<K2> <C2>`.
- `Confirmados 1 | Pendentes 1 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 100,00 | Estornados 0` (o pendente conta em Pendentes e ocupa vaga, mas não entra na Receita).
- `409 {"error":"sold_out"}` (passo 7); de novo `Confirmados 1 | Pendentes 1 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 100,00 | Estornados 0` (a recusa não criou nada).
- `declined|<x>` com x ≥ 45,0; `declined` (passo 8).
- `Confirmados 1 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 1 | Receita R$ 100,00 | Estornados 0` (o recusado não entra em nenhum número e liberou a vaga).
- `202`; `confirmed` (T3); `Confirmados 2 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 200,00 | Estornados 0`.
- `c03k`: `422` e nenhuma outra linha; `1` (reduzir a lotação para 1 é rejeitado — passo 9); `Confirmados 2 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 200,00 | Estornados 0` (nada mudou).
- `c03m`: `302` e `location: /organizador/eventos/<E1>?ok=atualizado` (preço R$ 150,00 e lotação 3 aceitos).
- `Confirmados 2 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 1 | Receita R$ 200,00 | Estornados 0` e `receita em centavos: 20000` (a mudança de preço não alterou a receita das compras anteriores; vagas = 3 − 2).
- `202`; `confirmed` (T4).
- `Confirmados 3 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 350,00 | Estornados 0` e `receita em centavos: 35000` (números do passo 9).
- Exatamente 4 linhas: `vitrine|confirmed|10000`, `api|declined|10000`, `api|confirmed|10000`, `api|confirmed|15000`.

#### C04 — Fluxo E1 (passo 10): check-ins — Depende de: C03

```bash
. /tmp/catraca-f09/aux.sh
. "$T/e1.env"; echo "$E1 $C1 $C2"
painel c04a "$E1"
checkin c04b "$E1" "$C1"
lerpainel c04b
painel c04c "$E1"
checkin c04d "$E1" "$C1"
painel c04e "$E1"
checkin c04f "$E1" "$C2"
painel c04g "$E1"
checkin c04h "$E1" ZZZZZZZZ
painel c04i "$E1"
api_ingresso "$K1" | cut -d'|' -f4,5
sql "SELECT code = '$C1', status, checked_in FROM tickets WHERE event_id = '$E1' AND checked_in"
```

Esperado:
- `<E1> <C1> <C2>` (valores do C03).
- `Confirmados 3 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 350,00 | Estornados 0`.
- `200 | mensagens: Entrada liberada` (C1).
- `Confirmados 3 | Pendentes 0 | Check-ins 1 | Vagas disponíveis 0 | Receita R$ 350,00 | Estornados 0` (o painel da própria resposta do check-in já conta a entrada).
- A mesma linha `Confirmados 3 | Pendentes 0 | Check-ins 1 | Vagas disponíveis 0 | Receita R$ 350,00 | Estornados 0` com a página recarregada (passo 10: Check-ins 1, Confirmados continua 3).
- `200 | mensagens: Ingresso já utilizado` (C1 de novo) e a mesma linha do painel.
- `200 | mensagens: Ingresso não confirmado` (C2, recusado) e a mesma linha do painel.
- `200 | mensagens: Ingresso inválido para este evento` (`ZZZZZZZZ`) e a mesma linha do painel.
- `confirmed|true` (a consulta da API do ingresso da vitrine mostra o check-in).
- Exatamente uma linha: `t|confirmed|t` (só C1 passou pelo check-in).

#### C05 — CF20: ingresso da API passa no check-in, a API mostra `"checkedIn":true` e o painel `Check-ins 1`

```bash
. /tmp/catraca-f09/aux.sh
E=$(evento 2 '30,00'); echo "$E"
api_comprar c05a "$E" 4000000000000001 cf20@example.com | cut -d' ' -f1
K=$(jcampo c05a ticketId); C=$(jcampo c05a code); echo "$K $C"
espera "$K" confirmed 8
grep -c '"checkedIn":false' "$T/ing.json"
painel c05b "$E"
checkin c05c "$E" "$C"
api_ingresso "$K"
grep -c '"checkedIn":true' "$T/ing.json"
painel c05d "$E"
sql "SELECT channel, status, checked_in, checked_in_at IS NOT NULL, buyer_user_id IS NULL FROM tickets WHERE id = '$K'"
```

Esperado:
- `<E>`; `202`; a linha `<K> <C>` (`tkt_` + 16 caracteres e código de 8 caracteres `A-Z0-9`).
- `200 <K>|<C>|<E>|confirmed|false`; `1`.
- `Confirmados 1 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 1 | Receita R$ 30,00 | Estornados 0`.
- `200 | mensagens: Entrada liberada`.
- `200 <K>|<C>|<E>|confirmed|true`; `1` (o corpo da consulta contém `"checkedIn":true`).
- `Confirmados 1 | Pendentes 0 | Check-ins 1 | Vagas disponíveis 1 | Receita R$ 30,00 | Estornados 0`.
- `api|confirmed|t|t|t` (compra da API, sem conta, com o check-in gravado).

#### C06 — CF19: 1 compra pela vitrine e 2 pela API, a R$ 100,00, contam juntas

```bash
. /tmp/catraca-f09/aux.sh
E=$(evento 5 '100,00'); echo "$E"
vitrine c06a "$E" 4000000000000001
vitrine c06b "$E" 4000000000000002
api_comprar c06c "$E" 4000000000000001 | cut -d' ' -f1
api_comprar c06d "$E" 4000000000000001 | cut -d' ' -f1
espera "$(cut -d' ' -f1 "$T/c06a.ticket")" confirmed 8 | cut -d'|' -f4
espera "$(cut -d' ' -f1 "$T/c06b.ticket")" declined 8 | cut -d'|' -f4
espera "$(jcampo c06c ticketId)" confirmed 8 | cut -d'|' -f4
espera "$(jcampo c06d ticketId)" confirmed 8 | cut -d'|' -f4
painel c06e "$E"
sql "SELECT t.channel, t.status, count(*), sum(t.price_paid_cents), bool_and(CASE WHEN t.channel = 'vitrine' THEN lower(u.email) = 'participante.f09.$U@example.com' ELSE t.buyer_user_id IS NULL END) FROM tickets t LEFT JOIN users u ON u.id = t.buyer_user_id WHERE t.event_id = '$E' GROUP BY t.channel, t.status ORDER BY t.channel, t.status"
```

Esperado:
- `<E>`; `302 location: /meus-ingressos?ok=compra | vitrine no evento: 0 -> 1 | <tkt> <código>` e `302 location: /meus-ingressos?ok=compra | vitrine no evento: 1 -> 2 | <tkt> <código>`.
- `202` e `202`.
- `confirmed`, `declined`, `confirmed`, `confirmed`.
- `Confirmados 3 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 2 | Receita R$ 300,00 | Estornados 0` (1 confirmada pela vitrine e 2 pela API, todas a R$ 100,00; a recusada da vitrine não conta nem ocupa vaga).
- Exatamente 3 linhas: `api|confirmed|2|20000|t`, `vitrine|confirmed|1|10000|t`, `vitrine|declined|1|10000|t` (vitrine com a conta nova; API sem conta).

#### C07 — Fluxo E3 (passos 12 a 14): cancelamento com 1 confirmado e 1 pendente

```bash
. /tmp/catraca-f09/aux.sh
E3=$(evento 5 '50,00'); echo "$E3"
painel c07a "$E3"
api_comprar c07b "$E3" 4000000000000003 t5@example.com | cut -d' ' -f1
api_comprar c07c "$E3" 4000000000000001 t6@example.com | cut -d' ' -f1
K5=$(jcampo c07b ticketId); K6=$(jcampo c07c ticketId); C6=$(jcampo c07c code)
espera "$K6" confirmed 8 | cut -d'|' -f4
painel c07d "$E3"
cancelar c07e "$E3"
painel c07f "$E3"
sql "SELECT EXTRACT(EPOCH FROM clock_timestamp() - e.cancelled_at) <= 10, EXTRACT(EPOCH FROM e.cancelled_at - t.created_at) < 30 FROM events e JOIN tickets t ON t.id = '$K5' WHERE e.id = '$E3'"
api_ingresso "$K6" | cut -d'|' -f4
api_ingresso "$K5" | cut -d'|' -f4
idade "$K5" 46
api_ingresso "$K5" | cut -d'|' -f4
painel c07g "$E3"
checkin c07h "$E3" "$C6"
painel c07i "$E3"
sql "SELECT status, checked_in FROM tickets WHERE event_id = '$E3' ORDER BY created_at, id"
```

Esperado:
- `<E3>`; `Confirmados 0 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 5 | Receita R$ 0,00 | Estornados 0`.
- `202` (T5, `…0003`) e `202` (T6, `…0001`); `confirmed` (T6).
- `Confirmados 1 | Pendentes 1 | Check-ins 0 | Vagas disponíveis 3 | Receita R$ 50,00 | Estornados 0`.
- `c07e`: `302` e `location: /organizador/eventos/<E3>?ok=cancelado`.
- `Confirmados 0 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 0,00 | Estornados 1` (números do passo 14).
- `t|t` (o painel acima foi lido a menos de 10 s do cancelamento, que aconteceu antes de completar 30 s da compra de T5).
- `refunded` (T6) e `cancelled` (T5).
- `cancelled|<x>` com x ≥ 46,0; `cancelled` (T5 continua cancelado depois da resposta do gateway).
- `Confirmados 0 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 0,00 | Estornados 1` (nada mudou com a resposta tardia).
- `200 | mensagens: Evento cancelado` (C6 no check-in de E3).
- A mesma linha `Confirmados 0 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 0,00 | Estornados 1`.
- Exatamente 2 linhas: `cancelled|f` e `refunded|f`.

#### C08 — Check-ins só de confirmados; estornado com check-in sai de Check-ins

```bash
. /tmp/catraca-f09/aux.sh
E=$(evento 3 '10,00'); echo "$E"
api_comprar c08a "$E" 4000000000000001 | cut -d' ' -f1
api_comprar c08b "$E" 4000000000000001 | cut -d' ' -f1
api_comprar c08c "$E" 4000000000000004 | cut -d' ' -f1
KA=$(jcampo c08a ticketId); CA=$(jcampo c08a code); KB=$(jcampo c08b ticketId); KC=$(jcampo c08c ticketId); CC=$(jcampo c08c code)
espera "$KA" confirmed 8 | cut -d'|' -f4
espera "$KB" confirmed 8 | cut -d'|' -f4
painel c08d "$E"
checkin c08e "$E" "$CC"
painel c08f "$E"
checkin c08g "$E" "$CA"
painel c08h "$E"
cancelar c08i "$E" | head -n 1
painel c08j "$E"
for k in "$KA" "$KB" "$KC"; do api_ingresso "$k" | cut -d'|' -f4,5; done
```

Esperado:
- `<E>`; `202`, `202`, `202`; `confirmed`, `confirmed`.
- `Confirmados 2 | Pendentes 1 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 20,00 | Estornados 0`.
- `200 | mensagens: Ingresso não confirmado` (o pendente `…0004`) e a mesma linha do painel.
- `200 | mensagens: Entrada liberada` e `Confirmados 2 | Pendentes 1 | Check-ins 1 | Vagas disponíveis 0 | Receita R$ 20,00 | Estornados 0`.
- `302`; `Confirmados 0 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 0,00 | Estornados 2` (o estornado que passou pelo check-in sai de Check-ins; o cancelado não entra em nenhum número).
- Exatamente 3 linhas: `refunded|true`, `refunded|false`, `cancelled|false`.

#### C09 — CF16: painel só para o dono; cada organizador vê só os próprios números

```bash
. /tmp/catraca-f09/aux.sh
E=$(evento 3 '77,00'); echo "$E"
N=$(sql "SELECT name FROM events WHERE id = '$E'"); echo "$N"
api_comprar c09a "$E" 4000000000000001 | cut -d' ' -f1
K=$(jcampo c09a ticketId); C=$(jcampo c09a code)
espera "$K" confirmed 8 | cut -d'|' -f4
painel c09b "$E"
for q in b ps visitante; do
  if [ "$q" = visitante ]; then j=/dev/null; else j="$T/$q.jar"; fi
  r=$(req "c09-$q" -b "$j" "$WEB/organizador/eventos/$E" | tr '\n' ' ')
  n=$(for s in 'data-secao="painel"' 'data-metrica=' 'Confirmados' 'Receita' 'R$ 77,00' "$N"; do grep -cF -- "$s" "$T/c09-$q.html"; done | paste -s -d ' ' -)
  echo "$q | $r| $n"
done
EB=$(evento 1 '20,00' publicado "$T/b.jar"); echo "$EB"
api_comprar c09c "$EB" 4000000000000001 | cut -d' ' -f1
CB=$(jcampo c09c code)
espera "$(jcampo c09c ticketId)" confirmed 8 | cut -d'|' -f4
painel c09d "$EB" "$T/b.jar"
naotem c09d 'R$ 77,00' "$N"
checkin c09e "$E" "$CB"
painel c09f "$E"
painel c09g "$EB" "$T/b.jar"
checkin c09h "$E" "$C" "$T/b.jar"
echo "$(conta c09h '<h1>Evento não encontrado</h1>') $(grep -cE 'data-metrica=|R\$ 77,00' "$T/c09h.html")"
painel c09i "$E"
api_ingresso "$K" | cut -d'|' -f4,5
```

Esperado:
- `<E>`; `<N>` (`Evento F09 <U>-<n>`); `202`; `confirmed`.
- `Confirmados 1 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 2 | Receita R$ 77,00 | Estornados 0` (o dono vê o painel).
- Exatamente 3 linhas:
  ```
  b | 404 | 0 0 0 0 0 0
  ps | 403 | 0 0 0 0 0 0
  visitante | 302 location: /entrar | 0 0 0 0 0 0
  ```
  (organizador B, participante da seed e visitante: nenhuma seção do painel, nenhum número, nem `Confirmados`, `Receita`, `R$ 77,00` ou o nome do evento).
- `<EB>`; `202`; `confirmed`.
- `Confirmados 1 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 20,00 | Estornados 0` (B vê o próprio painel); dois `ausente:` (nada do evento de A na página de B).
- `200 | mensagens: Ingresso inválido para este evento` (código do ingresso de B no check-in do evento de A).
- `Confirmados 1 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 2 | Receita R$ 77,00 | Estornados 0` (painel de A inalterado) e `Confirmados 1 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 20,00 | Estornados 0` (painel de B inalterado).
- `404 | mensagens: nenhuma` (B tentando o check-in no evento de A); `1 0` (página `Evento não encontrado`, sem números).
- `Confirmados 1 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 2 | Receita R$ 77,00 | Estornados 0`; `confirmed|false` (o ingresso de A não foi marcado).

#### C10 — Fluxo E4/E5 (passo 15): rajada de 30 compras pela API, 3 rodadas, painel em até 10 s

```bash
. /tmp/catraca-f09/aux.sh
for r in 1 2 3; do
  E=$(evento 5 '10,00') || break
  echo "rodada $r: $E"
  seq 30 | xargs -P 30 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "$API/api/partner/events/$E/purchases" \
    -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
    -d '{"buyerEmail":"carga{}@example.com","cardNumber":"4000000000000001"}' | sort | uniq -c
  painel "c10a$r" "$E"
  espera_painel "c10b$r" "$E" 'Confirmados 5 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 50,00 | Estornados 0' 10
  sql "SELECT EXTRACT(EPOCH FROM clock_timestamp() - max(created_at)) <= 10, count(*), count(*) FILTER (WHERE status = 'confirmed') FROM tickets WHERE event_id = '$E'"
done
```

O comando `seq 30 | xargs …` é o do passo 15 do brief, com `$E` no lugar de `$E4`/`$E5`.

Esperado, para **cada uma** das 3 rodadas (as duas primeiras são E4 e E5 do Fluxo; a terceira repete num evento novo):
- `rodada <r>: <E>`.
- Exatamente duas linhas, nesta ordem: `5 202` e `25 409` (com os espaços à esquerda que o `uniq -c` coloca).
- Logo depois da rajada, uma linha `Confirmados <c> | Pendentes <p> | Check-ins 0 | Vagas disponíveis 0 | Receita R$ <c×10>,00 | Estornados 0` com c + p = 5 (os pendentes já ocupam vaga; a receita é só dos confirmados: `R$ 0,00`, `R$ 10,00`, …, `R$ 50,00`).
- `Confirmados 5 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 50,00 | Estornados 0`.
- `t|5|5` (o painel mostrou os 5 confirmados a menos de 10 s da última compra criada; 5 ingressos, todos `confirmed`).

O item só passa se as três rodadas derem exatamente esse resultado.

#### C11 — Testes da F09 passam nos gates

```bash
. /tmp/catraca-f09/aux.sh
grep -hoE '(F09-CA0[1-5]|CF1[6-9]|CF20)' app/test/f09/*.test.ts | sort -u | paste -s -d ' ' -
npm run gates -- test/f09 > "$T/c11.txt" 2>&1; echo "exit=$?"
grep -E '^\[gates\] ' "$T/c11.txt"
```

Esperado:
- `CF16 CF17 CF18 CF19 CF20 F09-CA01 F09-CA02 F09-CA03 F09-CA04 F09-CA05` (cada critério da F09 dá nome a pelo menos um teste).
- `exit=0`.
- Entre as linhas `[gates] …` (além da linha do projeto Compose dos gates): `[gates] lint: ok`, `[gates] typecheck: ok`, `[gates] testes: ok (N executados, 0 falharam) [filtro: test/f09]` com `N` ≥ 20 e `[gates] resultado: OK` (inclui os testes de instantâneo único, de leitura sem trava e de rajada com leituras do painel, que não têm superfície própria no produto).

### Encerramento (depois do C11)

```bash
rm -rf /tmp/catraca-f09
```

Sem veredito. O `npm run down` final é feito pela skill de avaliação.

### 2.2 Roteiro opcional no navegador (sem veredito)

Complementa os itens acima para quem quiser ver a tela; não substitui nenhum item.

1. Entrar em `$WEB/entrar` com `organizador.a@catraca.test` / `catraca123`, criar um evento com lotação `2` e preço `100,00` e clicar em `Publicar`: na página de gestão, abaixo de "Check-in", a seção "Painel" mostra `Confirmados 0`, `Pendentes 0`, `Check-ins 0`, `Vagas disponíveis 2`, `Receita R$ 0,00` e `Estornados 0`.
2. Numa janela anônima, criar uma conta de participante em `$WEB/cadastro`, abrir o evento na vitrine e comprar com `4000000000000001`.
3. Recarregar a página de gestão: `Pendentes 1` e `Vagas disponíveis 1` logo depois; em até 5 s, `Confirmados 1` e `Receita R$ 100,00`.
4. Copiar o código do ingresso em "Meus ingressos", digitá-lo no campo `Código` e clicar em `Validar`: `Entrada liberada` e, no painel, `Check-ins 1`.
5. Clicar em `Cancelar evento` e confirmar: `Confirmados 0`, `Check-ins 0`, `Vagas disponíveis 0`, `Receita R$ 0,00` e `Estornados 1`.

## 3. Mapeamento critério → itens

| Critério (PRD) | Itens |
|----------------|-------|
| F09-CA01 | C01, C11 |
| F09-CA02 | C03, C02, C11 |
| F09-CA03 | C03, C06, C08, C10, C11 |
| F09-CA04 | C07, C11 |
| F09-CA05 | C04, C08, C11 |
| CF16 (F04 → F09) | C09, C03, C01 |
| CF17 (F05 → F09) | C03, C07, C08, C10, C11 |
| CF18 (F08 → F09) | C04, C08, C09 |
| CF19 (F06, F07 → F09) | C06 |
| CF20 (F07, F08 → F09) | C05 |

Notas do mapeamento:
- **F09-CA01:** C01 confere a seção com os seis rótulos exatos, uma vez, na página de gestão (R04), em rascunho, publicado e cancelado, com a marcação `data-metrica` de cada número.
- **F09-CA02 e os passos 9 do Fluxo:** C03 reproduz o E1 do Fluxo do avaliador (passos 5 a 9) com a vitrine (F06), a API (F07) e a edição da F04: duas compras confirmadas a R$ 100,00 (uma pela vitrine, uma pela API), uma recusada no meio, preço R$ 150,00 e lotação 3, terceira compra confirmada → `Confirmados 3 | Pendentes 0 | Check-ins 0 | Vagas disponíveis 0 | Receita R$ 350,00 | Estornados 0`. C02 confere o formato `R$ 1.234,56` (milhar, centavos, espaço comum) da capacidade "Receita no formato `R$ 1.234,56`".
- **F09-CA03:** pendente conta em Pendentes, ocupa vaga e fica fora da Receita (C03 com `…0004`, C08, C10 logo depois da rajada); recusado não entra em nenhum número e libera a vaga (C03 aos 45 s, C06 com a recusa da vitrine); cancelado não entra em nenhum número (C07, C08 depois do cancelamento).
- **F09-CA04 e o passo 14:** C07 reproduz o E3 do Fluxo (passos 12 a 14): 1 confirmado e 1 pendente `…0003`, cancelamento antes de 30 s → `0/0/0/0/R$ 0,00/Estornados 1` em até 10 s, igual depois de 46 s (resposta tardia ignorada) e depois do check-in `Evento cancelado`.
- **F09-CA05 e o passo 10:** C04 reproduz o check-in de E1 do Fluxo (passo 10): `Check-ins 1` com `Confirmados 3`; C08 mostra que Check-ins conta só confirmados (o estornado que passou pelo check-in sai de Check-ins e de Confirmados).
- **CF16 (F04 → F09):** C09 verifica que o painel só aparece para o dono (organizador B `404`, participante `403`, visitante `302`, sem nenhum dado do painel; cada organizador vê só o próprio painel); C03 verifica que a mudança de preço feita pela F04 não altera a Receita das compras anteriores (`R$ 200,00` antes e depois da edição, `R$ 350,00` só com a compra nova a R$ 150,00); C01 verifica que a seção fica na página de gestão do dono.
- **CF17 (F05 → F09):** os números batem com os ingressos da F05 em cada passo (C03, com a consulta final dos ingressos; C07 e C08 depois do cancelamento; C10 com a contagem no banco), inclusive Vagas disponíveis conforme R05 e Estornados depois do cancelamento.
- **CF18 (F08 → F09):** um `Entrada liberada` aumenta Check-ins em 1 sem mudar Confirmados (C04, C08); tentativas recusadas — `Ingresso já utilizado`, `Ingresso não confirmado`, `Ingresso inválido para este evento` (C04, C09), `Evento cancelado` (C07) e a tentativa de outro organizador (C09, `404`) — não mudam nenhum número.
- **CF19 (F06, F07 → F09):** C06, literalmente: 1 compra confirmada pela vitrine e 2 pela API, todas a R$ 100,00 → `Confirmados 3` e `Receita R$ 300,00`.
- **CF20 (F07, F08 → F09):** C05, literalmente: ingresso comprado pela API, `Entrada liberada`, `GET /api/partner/tickets/{id}` com `"checkedIn":true` e `Check-ins 1`.
- **Passo 15 do Fluxo:** C10 roda a rajada do brief em 3 eventos novos (E4, E5 e mais um) e confere `Confirmados 5` e `Vagas disponíveis 0` em até 10 s.
- **C11** sustenta todos os critérios com os testes automatizados da spec (inclusive o instantâneo único da leitura e a leitura durante rajadas, que não têm superfície observável própria); cada critério com superfície no produto também tem itens HTTP/TEMPO.

## 4. Fora deste contrato

- **Vitrine em si (F06):** `Ingressos esgotados`, `Número de cartão inválido`, "Meus ingressos", `Entrar para comprar` — contrato da F06 (CF07, CF08, CF09). Aqui a vitrine é usada só para criar compras do canal `vitrine`.
- **API de parceiros em si (F07):** campos exatos, `401`, `422`, ordem dos erros, `availableSeats`, garantia de exatamente 5 × `202` e 25 × `409` como critério de R07 — contrato da F07 (CF10–CF13) e da F05 (F05-CA05). Aqui a rajada é usada para conferir o painel; as contagens `202`/`409` aparecem como pré-condição do item C10.
- **Check-in em si (F08):** ordem de R10, normalização do código, código em branco, check-ins simultâneos — contrato da F08 (CF14, CF15). Aqui as mensagens são usadas para conferir que só `Entrada liberada` muda o painel.
- **Ciclo do ingresso e gateway (F03, F05):** tempos de confirmação e recusa, efeitos do cancelamento nos ingressos, resposta tardia — contratos da F03 e da F05 (CF04–CF06). Aqui só se observa o painel depois deles.
- **Gestão de eventos e isolamento da página em si (F04):** criação, edição, publicação, cancelamento, `404` idêntico para evento alheio e inexistente, lista do organizador — contrato da F04 (CF03). Aqui só se confere que nenhum número do painel vaza.
- Atualização em tempo real, gráficos e números por canal: fora de escopo do PRD.

## 5. Alterações do contrato

Nenhuma.
