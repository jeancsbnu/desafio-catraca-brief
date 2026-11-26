# Contrato: F06 — Vitrine e Meus ingressos

## 1. Pré-requisitos de ambiente

- **Commit avaliado:** o avaliador registra o hash no relatório (`git rev-parse HEAD` na raiz do repositório avaliado — `main`, branch ou worktree da F06).
- **Onde roda:** na raiz da pasta do repositório avaliado, num shell `bash` (Linux, macOS ou WSL). Cada bloco do roteiro começa com `. /tmp/catraca-f06/aux.sh` (criado na Preparação), que entra na raiz do repositório e define variáveis e funções; por isso os blocos podem rodar em shells separados.
- **Subir:** `npm run up` · **Derrubar:** `npm run down` · **Gates:** `npm run gates` (comandos do `AGENTS.md`; nenhum `npm install`). Conforme a skill `evaluate-feature`, o avaliador roda `npm run down` e `npm run up` antes da Preparação.
- **Endereços:** `$WEB` = `$API` = `http://localhost:3000`; se a pasta avaliada tiver um `.env` com `CATRACA_PORT`, a Preparação usa essa porta (nenhum resultado esperado muda: os `location` são caminhos relativos). **Chave de parceiro:** `parceiro-catraca-dev` (README); não é usada neste contrato — a API de parceiros é da F07, da mesma wave.
- **Contas da seed:** organizador A (`organizador.a@catraca.test`), organizador B (`organizador.b@catraca.test`), participante (`participante@catraca.test`); senha `catraca123` para as três, conforme o README (seção "Credenciais"). Os organizadores criam, publicam e cancelam eventos pela interface da F04; o participante da seed só aparece como comprador de terceiros no C08. Os participantes que compram pela vitrine são **contas novas criadas pela interface** (`/cadastro`, função `cadastrar`), uma ou duas por item.
- **Modo:** padrão — gateway simulado com os **tempos reais do brief** (`…0001`/`…0002` em 2–5 s, `…0003`/`…0004` em 30–40 s). Nenhuma variável `GATEWAY_*` no shell nem no `.env`; um `.env` local só é aceito com `CATRACA_PORT` e/ou `COMPOSE_PROJECT_NAME` (conferido na Preparação).
- **Superfícies usadas:** só as de F01–F06: as páginas e formulários HTTP da vitrine (`/`, `/eventos/{id}`, `/eventos/{id}/comprar`, `/meus-ingressos`), o cadastro e o login da F02, a gestão de eventos da F04 (com o cookie dos organizadores), o comando `catraca compra:simular` da F05 (dentro do container `app`) para compras de terceiros — `--email` cria a compra pelo canal `api` (sem conta), `--conta` pelo canal `vitrine` —, e consultas SQL de leitura no container `db`. Nenhum item usa a API de parceiros nem o check-in (F07 e F08, mesma wave), nem o painel (F09).
- **Como medir tempo:** as janelas do brief são conferidas no relógio do banco (`tickets.created_at` e `tickets.status_changed_at`). A função `idade` espera o ingresso completar N segundos de vida (relógio do banco) e mostra o status naquele instante; a página é recarregada logo em seguida.
- **Ferramentas do avaliador:** `bash`, `git`, `curl`, `awk`, `sed`, `grep`, `sort`, `uniq`, `xargs`, `seq`, `diff`, `cmp`, `wc`, `docker` com Compose v2, `node` (LTS), `npm`. Navegador só no roteiro opcional (2.2).
- **Datas:** a Preparação calcula, no fuso `America/Sao_Paulo`, `PROX` (dia 15 do mês seguinte, 21:00), `CEDO` (dia 10 do mês seguinte, 19:30) e `DEPOIS` (dia 20 do mês depois do seguinte, 20:30), no formato `AAAA-MM-DDTHH:MM` e, com sufixo `_BR`, `DD/MM/AAAA HH:MM`. Todos os eventos usam `PROX`, salvo indicação.
- **Ordem e dados:** os itens rodam na ordem numérica. Cada item cria os próprios eventos (função `evento`, nomes `Evento F06 <U>-<k>` e locais `Local F06 <U>-<k>`, sufixo `$U` único por avaliação), as próprias contas (e-mails `<prefixo>-<U>@example.com`, senha `segredo123`) e as próprias compras, e não depende de outro item. Dados criados: eventos dos organizadores A e B (publicados, rascunhos e cancelados), contas de participante novas, ingressos e tentativas de pagamento. Nenhuma escrita fora das superfícies do produto.
- **Duração:** cerca de 4 minutos (o C03 espera 45 s pela recusa do gateway; C08 e C09, alguns segundos).

### Preparação (antes do C01)

```bash
# na raiz do repositório avaliado, com o ambiente já subido por npm run up
git status --porcelain | wc -l
git rev-parse HEAD
env | grep -c '^GATEWAY_'
if [ -e .env ]; then grep -vE '^[[:space:]]*(#|$)' .env | grep -cvE '^(CATRACA_PORT|COMPOSE_PROJECT_NAME)='; else echo "sem .env"; fi
mkdir -p /tmp/catraca-f06 && rm -rf /tmp/catraca-f06/*
printf "cd '%s'\n" "$(git rev-parse --show-toplevel)" > /tmp/catraca-f06/aux.sh
printf 'U=%s\n' "$(date +%s)" >> /tmp/catraca-f06/aux.sh
TZ=America/Sao_Paulo node -e '
const p = (n) => String(n).padStart(2, "0");
const h = new Date();
const a = new Date(h.getFullYear(), h.getMonth() + 1, 15);
const c = new Date(h.getFullYear(), h.getMonth() + 1, 10);
const d = new Date(h.getFullYear(), h.getMonth() + 2, 20);
const iso = (x, t) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${t}`;
const br = (x, t) => `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()} ${t}`;
console.log(`PROX=${iso(a, "21:00")}`);
console.log(`PROX_BR="${br(a, "21:00")}"`);
console.log(`CEDO=${iso(c, "19:30")}`);
console.log(`CEDO_BR="${br(c, "19:30")}"`);
console.log(`DEPOIS=${iso(d, "20:30")}`);
console.log(`DEPOIS_BR="${br(d, "20:30")}"`);
' >> /tmp/catraca-f06/aux.sh
cat >> /tmp/catraca-f06/aux.sh <<'EOF'
T=/tmp/catraca-f06
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
# cadastrar <id> <jar> <e-mail>: conta de participante nova pela interface (F02), senha segredo123; a sessão fica no jar
cadastrar() { req "$1" -c "$2" -b "$2" --data-urlencode "nome=Participante F06 $U" --data-urlencode "email=$3" --data-urlencode "senha=segredo123" "$WEB/cadastro"; }
# evento <lotação> <preço> [publicado|rascunho] [início] [jar]: cria um evento novo pela F04 (organizador A por padrão) e o publica, salvo "rascunho"; imprime o id
evento() {
  _k=$(( $(cat "$T/k" 2>/dev/null || echo 0) + 1 )); echo "$_k" > "$T/k"
  _j=${5:-$T/a.jar}
  _s=$(req "ev$_k" -b "$_j" --data-urlencode "nome=Evento F06 $U-$_k" --data-urlencode "inicio=${4:-$PROX}" --data-urlencode "local=Local F06 $U-$_k" --data-urlencode "lotacao=$1" --data-urlencode "preco=$2" "$WEB/organizador/eventos" | head -n 1)
  _e=$(tr -d '\r' < "$T/ev$_k.h" | sed -n 's|^[Ll]ocation: /organizador/eventos/\(evt_[a-z0-9]\{16\}\)?ok=criado$|\1|p')
  if [ "$_s" != 302 ] || [ -z "$_e" ]; then echo "FALHA: criar evento respondeu $_s" >&2; return 1; fi
  if [ "${3:-publicado}" != rascunho ]; then
    _s=$(req "pu$_k" -b "$_j" -X POST "$WEB/organizador/eventos/$_e/publicar" | head -n 1)
    if [ "$_s" != 302 ]; then echo "FALHA: publicar respondeu $_s" >&2; return 1; fi
  fi
  echo "$_e"
}
# publicar / cancelar <id> <evento>: publicação e cancelamento confirmado pela F04, como organizador A
publicar() { req "$1" -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$2/publicar"; }
cancelar() { req "$1" -b "$T/a.jar" --data-urlencode 'confirmar=sim' "$WEB/organizador/eventos/$2/cancelar"; }
nome() { sql "SELECT name FROM events WHERE id = '$1'"; }
# comprar <id> <jar ou -> <evento> <cartão>: envia o formulário de compra da vitrine ("-" = sem cookie)
comprar() { if [ "$2" = - ]; then req "$1" --data-urlencode "cartao=$4" "$WEB/eventos/$3/comprar"; else req "$1" -b "$2" --data-urlencode "cartao=$4" "$WEB/eventos/$3/comprar"; fi; }
# meus <id> <jar> [query]: GET /meus-ingressos com a sessão do jar
meus() { req "$1" -b "$2" "$WEB/meus-ingressos${3-}"; }
# linha <id> <evento>: a linha da vitrine do evento no corpo guardado, com o id trocado por <E>, o nome por <N> e o local por <L> (nada se o evento não está na vitrine)
linha() { _n=$(nome "$2"); _l=$(sql "SELECT location FROM events WHERE id = '$2'"); grep -F "<tr data-evento=\"$2\">" "$T/$1.html" | sed -e "s|$2|<E>|g" -e "s|>$_n<|><N><|" -e "s|>$_l<|><L><|"; }
# bloco <id> <evento>: o bloco de compra (de <section data-compra=…> a </section>) do corpo guardado, com o id do evento trocado por <E>
bloco() { sed -n '/^<section data-compra=/,/^<\/section>$/p' "$T/$1.html" | sed "s|$2|<E>|g"; }
# ingressos <id>: as linhas da tabela de "Meus ingressos" do corpo guardado, como evento|data|status|rótulo|código
ingressos() { grep '^<tr><td>' "$T/$1.html" | sed -E 's#^<tr><td>([^<]*)</td><td>([^<]*)</td><td data-status="([a-z]+)">([a-z]+)</td><td><code>([A-Z0-9]{8})</code></td></tr>$#\1|\2|\3|\4|\5#'; }
# banco <e-mail>: os ingressos vinculados à conta do e-mail, lidos do banco, no mesmo formato, do mais recente para o mais antigo
banco() { sql "SELECT concat_ws('|', e.name, to_char(e.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), t.status, CASE t.status WHEN 'pending' THEN 'pendente' WHEN 'confirmed' THEN 'confirmado' WHEN 'declined' THEN 'recusado' WHEN 'cancelled' THEN 'cancelado' WHEN 'refunded' THEN 'estornado' END, t.code) FROM tickets t JOIN events e ON e.id = t.event_id JOIN users u ON u.id = t.buyer_user_id WHERE lower(u.email) = lower('$1') ORDER BY t.created_at DESC, t.id DESC"; }
# ultimo <e-mail>: id do ingresso mais recente vinculado à conta
ultimo() { sql "SELECT t.id FROM tickets t JOIN users u ON u.id = t.buyer_user_id WHERE lower(u.email) = lower('$1') ORDER BY t.created_at DESC, t.id DESC LIMIT 1"; }
# ningressos <evento>: total de ingressos do evento|ingressos pending+confirmed
ningressos() { sql "SELECT count(*), count(*) FILTER (WHERE status IN ('pending', 'confirmed')) FROM tickets WHERE event_id = '$1'"; }
compra() { docker compose exec -T app catraca compra:simular "$@" < /dev/null; }
# tkt <arquivo> [n]: n-ésimo id de ingresso que aparece no arquivo
tkt() { grep -oE 'tkt_[a-z0-9]{16}' "$1" | sed -n "${2:-1}p"; }
# semtempo / semid: tiram a duração e o id/código das linhas da compra:simular (filtros)
semtempo() { sed 's/ em [0-9]*,[0-9]* s$//'; }
semid() { sed -E 's/tkt_[a-z0-9]{16} código [A-Z0-9]{8}/<ingresso>/'; }
# idade <tkt> <s>: espera o ingresso completar <s> segundos desde a criação (relógio do banco) e imprime status|idade
idade() { _r=$(sql "SELECT greatest(0, $2 - EXTRACT(EPOCH FROM clock_timestamp() - created_at)) FROM tickets WHERE id = '$1'"); sleep "${_r:-0}"; sql "SELECT status, round(EXTRACT(EPOCH FROM clock_timestamp() - created_at)::numeric, 1) FROM tickets WHERE id = '$1'"; }
# janela <tkt> <a> <b>: status|segundos entre a criação e a última mudança de status|dentro ou fora de [a; b]
janela() { sql "SELECT status, round(EXTRACT(EPOCH FROM status_changed_at - created_at)::numeric, 3), CASE WHEN EXTRACT(EPOCH FROM status_changed_at - created_at) BETWEEN $2 AND $3 THEN 'dentro' ELSE 'fora' END FROM tickets WHERE id = '$1'"; }
# rajada <jar> <evento>: 30 envios simultâneos do formulário de compra com a mesma sessão; imprime quantas respostas de cada status HTTP
rajada() { seq 30 | xargs -P 30 -I{} curl -s -o /dev/null -w '%{http_code}\n' -b "$1" --data-urlencode 'cartao=4000000000000001' "$WEB/eventos/$2/comprar" | sort | uniq -c | awk '{ print $1 " " $2 }'; }
EOF
. /tmp/catraca-f06/aux.sh
sed -n '2,8p' /tmp/catraca-f06/aux.sh
curl -s -w '\n%{http_code}\n' "$WEB/health"
sql "SELECT to_regclass('public.events') IS NOT NULL, to_regclass('public.tickets') IS NOT NULL"
docker compose exec -T app catraca help < /dev/null | grep -cE '^  (compra:simular|ingresso:consultar) '
docker compose logs --no-log-prefix app | grep -F '"msg":"gateway: worker iniciado"' | tail -n 1 | grep -cE '"escala":1[,}]'
entrar pa "$T/a.jar" organizador.a@catraca.test
entrar pb "$T/b.jar" organizador.b@catraca.test
req pv "$WEB/"; tem pv '<title>Eventos à venda · Catraca</title>' '<h1>Eventos à venda</h1>'
```

Esperado:
- `0` (árvore limpa); o hash do commit; `0` (nenhuma variável `GATEWAY_*` no shell); `sem .env` ou `0` (o `.env` só tem `CATRACA_PORT`/`COMPOSE_PROJECT_NAME`).
- Sete linhas: `U=<número>`, `PROX=<AAAA-MM>-15T21:00` (mês seguinte ao atual), `PROX_BR="15/<MM>/<AAAA> 21:00"`, `CEDO=<AAAA-MM>-10T19:30` (mês seguinte), `CEDO_BR="10/<MM>/<AAAA> 19:30"`, `DEPOIS=<AAAA-MM>-20T20:30` (dois meses à frente), `DEPOIS_BR="20/<MM>/<AAAA> 20:30"`.
- `{"status":"ok"}` e `200`.
- `t|t` (as tabelas de eventos e de ingressos existem).
- `2` (o `help` lista `compra:simular` e `ingresso:consultar`).
- `1` (o worker do gateway está no ar com escala 1, os tempos do brief).
- `pa` e `pb`: `302`, `location: /organizador` e [cria].
- `pv`: `200` e dois `ok:`.

Sem isso, o contrato não é executável.

**Convenções dos resultados esperados:**
- A saída de `req` (e de `cadastrar`, `entrar`, `comprar`, `meus`, `publicar`, `cancelar`) é o status HTTP na primeira linha e, depois, as linhas `location:`/`set-cookie:` da resposta, na ordem em que vieram. "Nenhuma outra linha" quer dizer que a resposta não tem `location` nem `set-cookie`.
- **[cria]** = uma linha `set-cookie: catraca_sessao=<valor>; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax` (sessão da F02).
- **[comprou]** = status `302` e a linha `location: /meus-ingressos?ok=compra`, e nenhuma outra.
- `evento` imprime só o id `evt_<16 caracteres [a-z0-9]>`; se imprimir `FALHA: …`, a superfície da F04 falhou e o item é ✗ `não executável`.
- `<E>`, `<N>`, `<L>`, `<U>`, `<PROX_BR>` etc. indicam o valor da variável (ou o marcador que `linha`/`bloco` põem no lugar do id, do nome e do local do evento) no momento da execução; `<x>`, `<s>` são números conferidos pela faixa indicada.
- **Linha da vitrine** (saída de `linha`), evento com vagas: `<tr data-evento="<E>"><td><a href="/eventos/<E>"><N></a></td><td><data></td><td><L></td><td><preço></td><td><vagas></td><td><a href="/eventos/<E>">Comprar</a></td></tr>`; evento sem vagas: `<tr data-evento="<E>"><td><a href="/eventos/<E>"><N></a></td><td><data></td><td><L></td><td><preço></td><td>0</td><td>Ingressos esgotados</td></tr>`. Cada item diz `<data>`, `<preço>` e `<vagas>`.
- **Blocos de compra** (saída de `bloco`), exatamente estas linhas:

**[formulário]**
```
<section data-compra="formulario">
<h2>Comprar ingresso</h2>
<form method="post" action="/eventos/<E>/comprar">
<label for="cartao">Número do cartão</label>
<input id="cartao" name="cartao" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="16 dígitos">
<button type="submit">Comprar</button>
</form>
</section>
```

**[esgotado]**
```
<section data-compra="esgotado">
<p><strong>Ingressos esgotados</strong></p>
</section>
```

**[entrar]**
```
<section data-compra="entrar">
<p><a href="/entrar?voltar=%2Feventos%2F<E>">Entrar para comprar</a></p>
</section>
```

**[organizador]**
```
<section data-compra="organizador">
<p>Compras são feitas com uma conta de participante</p>
</section>
```

- **Linhas de "Meus ingressos"** (saída de `ingressos` e de `banco`): `<nome do evento>|<DD/MM/AAAA HH:MM>|<status>|<rótulo>|<código>`, com `<código>` casando com `[A-Z0-9]{8}`. Uma linha da tabela fora do formato da spec aparece crua (em HTML) na saída de `ingressos` — isso é ✗.

## 2. Itens verificáveis

A tabela é o índice. Os comandos exatos e o resultado completo de cada item estão no roteiro 2.1, que prevalece sobre o resumo.

| ID | Item | Tipo | Como verificar (resumo) | Resultado esperado (resumo) | Regras |
|----|------|------|-------------------------|-----------------------------|--------|
| C01 | Vitrine deslogada lista os eventos à venda com nome, data e hora, local, preço e vagas, por data de início | HTTP | Eventos publicados de A (datas `DEPOIS` e `CEDO`, preços `1234,56` e `100,00`) e de B (`PROX`, `20,00`) e um rascunho; `GET /` sem cookie | Linhas exatas com `10/MM/AAAA 19:30`/`R$ 100,00`/2, `15/MM/AAAA 21:00`/`R$ 20,00`/3, `20/MM/AAAA 20:30`/`R$ 1.234,56`/4, nessa ordem; rascunho ausente | R02, R05 |
| C02 | CF08: rascunho fora da vitrine e da página pública, publicado aparece, cancelado sai | HTTP + DB | Rascunho → vitrine e `/eventos/{id}`; publicar pela F04; participante abre o formulário; cancelar pela F04; vitrine, página e envio do formulário aberto | Rascunho ausente e `404` `Evento não encontrado` idêntico ao de evento inexistente e de id inválido; publicado na vitrine com 2 vagas e página `200`; cancelado ausente, página `404` idêntica e compra `404` sem ingresso | R02, R11 |
| C03 | Fluxo do avaliador, passos 2, 4, 5 e 7 (vitrine): conta nova compra com `…0001`, vê `pendente` e em até 5 s `confirmado`; lotado mostra `Ingressos esgotados`; a recusa devolve a vaga | TEMPO | E1 (lotação 2, `100,00`) rascunho → publicado; `/cadastro`; compra; "Meus ingressos" logo depois e aos 5 s; terceiro com `…0004` pela `compra:simular`; vitrine, página e nova tentativa antes de 30 s; de novo depois de 45 s | `Compra registrada`; `pendente` com código; aos 5 s `confirmado`, janela 2–5 s; antes de 30 s: vitrine com 0 e `Ingressos esgotados`, página com [esgotado], tentativa `409` `Ingressos esgotados` sem ingresso; depois da recusa: 1 vaga e [formulário] | R02, R05, R06, R07, R08, R09 |
| C04 | Cartão inválido: `Número de cartão inválido` sem criar ingresso; espaços digitados são removidos | HTTP + DB | Envios com 15 e 17 dígitos, letra, hífens, vazio e sem o campo; depois `4000 0000 0000 0001` e ` 4000000000000001 ` | `422` com a mensagem uma vez, no topo, e o [formulário]; número digitado ausente da página; nenhum ingresso nem tentativa; os dois últimos [comprou], tentativas com final `0001` | R06 (brief: 16 dígitos) |
| C05 | Compra enviada depois de as vagas acabarem: `Ingressos esgotados`, sem ingresso; página troca o formulário | HTTP + CLI + DB | Lotação 1; participante abre a página (formulário); terceiro compra pela `compra:simular`; participante envia | `409` com `Ingressos esgotados` e [esgotado]; 1 ingresso; página do participante e do visitante com [esgotado]; vitrine com 0 e `Ingressos esgotados`; "Meus ingressos" vazio | R05, R07 |
| C06 | R07 pela vitrine: 30 envios simultâneos em lotação 5, 3 rodadas em eventos novos | HTTP + DB | `rajada` (30 `curl` paralelos com a mesma sessão de participante) em 3 eventos novos; contagens; vitrine | Em cada rodada exatamente `5 302` e `25 409`; 5 ingressos, 5 ocupadas; vitrine com 0 e `Ingressos esgotados`; nova tentativa `409` | R05, R07 |
| C07 | Acesso: visitante vai a `/entrar` pelo `Entrar para comprar` e volta ao evento; envio sem sessão volta ao login; organizador vê a mensagem de participante | HTTP + DB | Página como visitante; seguir o link; login com `voltar`; envios sem cookie, com cookie adulterado e de outra origem; `/meus-ingressos` sem sessão; organizadores A e B na página e no envio | [entrar]; login volta a `/eventos/<E>` com [formulário]; envios `302` para `/entrar?voltar=%2Feventos%2F<E>` e `403` `Requisição bloqueada`; `/meus-ingressos` → `/entrar?voltar=%2Fmeus-ingressos`; [organizador] na página e no `403` do envio; nenhum ingresso | R06 |
| C08 | "Meus ingressos" só com as compras da vitrine da conta logada: nem de outra conta, nem pela API com o mesmo e-mail | HTTP + CLI + DB | Contas X e Y compram pela vitrine; terceiro pelo canal `api` com o e-mail de X e participante da seed pelo canal `vitrine`; páginas de X e Y | Cada página com exatamente 1 linha (o próprio ingresso, igual ao banco); códigos de Y, da API e da seed ausentes da página de X (e vice-versa) | R09 |
| C09 | "Meus ingressos": do mais recente para o mais antigo, com os cinco rótulos e o nome do evento cancelado | TEMPO | Uma conta compra em 4 eventos (`…0001`, `…0003`, `…0002`, `…0001`, `…0003`); A cancela o evento das duas primeiras; página aos 6 s | 5 linhas iguais ao banco, na ordem: `pendente`, `confirmado`, `recusado`, `cancelado`, `estornado`; evento cancelado com nome e fora da vitrine | R08, R09, R11 |
| C10 | Vagas na vitrine = lotação − (pendentes + confirmados); recusado libera | TEMPO | Lotação 5; uma compra pela vitrine (`…0001`) e três pela `compra:simular` (`…0001`, `…0003`, `…0002`); vitrine e página logo e aos 6 s; banco | Logo: 1 vaga; aos 6 s (com o `…0002` recusado): 2 vagas; banco `5|1|2|1|2` | R05, R08 |

### 2.1 Roteiro detalhado

Todos os comandos rodam a partir da raiz do repositório (o `aux.sh` faz o `cd`).

#### C01 — Vitrine deslogada lista os eventos à venda com nome, data e hora, local, preço e vagas, por data de início

```bash
. /tmp/catraca-f06/aux.sh
El=$(evento 4 '1234,56' publicado "$DEPOIS"); Ec=$(evento 2 '100,00' publicado "$CEDO"); Er=$(evento 2 '100,00' rascunho); Eb=$(evento 3 '20,00' publicado "$PROX" "$T/b.jar")
echo "$El $Ec $Er $Eb"
req c01a "$WEB/"
tem c01a '<title>Eventos à venda · Catraca</title>' '<h1>Eventos à venda</h1>' '<thead><tr><th>Evento</th><th>Data e hora</th><th>Local</th><th>Preço</th><th>Vagas disponíveis</th><th>Compra</th></tr></thead>'
linha c01a "$Ec"
linha c01a "$Eb"
linha c01a "$El"
linha c01a "$Er"
naotem c01a "$Er" "$(nome "$Er")"
grep -oE 'data-evento="evt_[a-z0-9]{16}"' "$T/c01a.html" | sed -e "s|.*$Ec.*|Ec|" -e "s|.*$Eb.*|Eb|" -e "s|.*$El.*|El|" | grep -E '^E[cbl]$' | tr '\n' ' '; echo
```

Esperado:
- Quatro ids no formato `evt_` + 16 caracteres (o último, de um evento do organizador B).
- `c01a`: `200` e nenhuma outra linha; três `ok:`.
- Exatamente estas três linhas, nesta ordem (uma por comando `linha`), e nada para o rascunho:
  ```
  <tr data-evento="<E>"><td><a href="/eventos/<E>"><N></a></td><td><CEDO_BR></td><td><L></td><td>R$ 100,00</td><td>2</td><td><a href="/eventos/<E>">Comprar</a></td></tr>
  <tr data-evento="<E>"><td><a href="/eventos/<E>"><N></a></td><td><PROX_BR></td><td><L></td><td>R$ 20,00</td><td>3</td><td><a href="/eventos/<E>">Comprar</a></td></tr>
  <tr data-evento="<E>"><td><a href="/eventos/<E>"><N></a></td><td><DEPOIS_BR></td><td><L></td><td>R$ 1.234,56</td><td>4</td><td><a href="/eventos/<E>">Comprar</a></td></tr>
  ```
  com `<CEDO_BR>`, `<PROX_BR>` e `<DEPOIS_BR>` substituídos pelos valores da Preparação (data e hora `DD/MM/AAAA HH:MM`, fuso -03:00); o preço no formato `R$ 1.234,56`; as vagas iguais à lotação (nenhuma compra).
- Dois `ausente:` (o id e o nome do rascunho não aparecem na vitrine).
- `Ec Eb El ` (ordem pela data de início — 10 do mês seguinte, 15 do mês seguinte, 20 de dois meses à frente —, não pela ordem de criação; eventos de A e de B na mesma lista).

#### C02 — CF08: rascunho fora da vitrine e da página pública, publicado aparece, cancelado sai

```bash
. /tmp/catraca-f06/aux.sh
E=$(evento 2 '100,00' rascunho); N=$(nome "$E"); echo "$E | $N"
req c02a "$WEB/"; linha c02a "$E"
req c02b "$WEB/eventos/$E"
req c02c "$WEB/eventos/evt_0000000000000000"
req c02d "$WEB/eventos/nao-e-um-evento"
cmp -s "$T/c02b.html" "$T/c02c.html" && echo "rascunho = inexistente" || echo "DIFERENTES"
cmp -s "$T/c02b.html" "$T/c02d.html" && echo "rascunho = id inválido" || echo "DIFERENTES"
tem c02b '<title>Evento não encontrado · Catraca</title>' '<h1>Evento não encontrado</h1>' '<p><a href="/">Voltar para a vitrine</a></p>'
naotem c02b "$N" "$E" 'data-compra'
publicar c02e "$E" | sed "s|$E|<E>|"
req c02f "$WEB/"; linha c02f "$E"
req c02g "$WEB/eventos/$E"
tem c02g "<title>$N · Catraca</title>" "<h1>$N</h1>" "<dt>Data e hora</dt><dd>$PROX_BR</dd>" "<dt>Local</dt><dd>$(sql "SELECT location FROM events WHERE id = '$E'")</dd>" '<dt>Preço</dt><dd>R$ 100,00</dd>' '<dt>Vagas disponíveis</dt><dd>2</dd>'
cadastrar c02h "$T/c02.jar" "status-$U@example.com"
req c02i -b "$T/c02.jar" "$WEB/eventos/$E"; bloco c02i "$E"
cancelar c02j "$E" | sed "s|$E|<E>|"
req c02k "$WEB/"; linha c02k "$E"
req c02l "$WEB/eventos/$E"
cmp -s "$T/c02l.html" "$T/c02c.html" && echo "cancelado = inexistente" || echo "DIFERENTES"
comprar c02m "$T/c02.jar" "$E" 4000000000000001; tem c02m '<h1>Evento não encontrado</h1>'; naotem c02m "$N"
ningressos "$E"
```

Esperado:
- `<E> | Evento F06 <U>-<k>`.
- `c02a`: `200`; nenhuma linha de `linha` (o rascunho não está na vitrine).
- `c02b`, `c02c`, `c02d`: `404` cada, e nenhuma outra linha.
- `rascunho = inexistente` e `rascunho = id inválido` (os três corpos são idênticos byte a byte).
- Três `ok:`; três `ausente:` (nem nome, nem id, nem bloco de compra na página do rascunho).
- `c02e`: `302` e `location: /organizador/eventos/<E>?ok=publicado`.
- `c02f`: `200`; a linha da vitrine com `<PROX_BR>`, `R$ 100,00`, vagas `2` e o link `Comprar`.
- `c02g`: `200`; seis `ok:`.
- `c02h`: `302`, `location: /` e [cria].
- `c02i`: `200`; [formulário] (o participante está com o formulário aberto).
- `c02j`: `302` e `location: /organizador/eventos/<E>?ok=cancelado`.
- `c02k`: `200`; nenhuma linha de `linha` (o evento cancelado saiu da vitrine).
- `c02l`: `404`; `cancelado = inexistente`.
- `c02m`: `404` e nenhuma outra linha; `ok:` e `ausente:` (o formulário enviado depois do cancelamento responde `Evento não encontrado`).
- `0|0` (nenhum ingresso foi criado no evento).

#### C03 — Fluxo do avaliador, passos 2, 4, 5 e 7 (vitrine)

```bash
. /tmp/catraca-f06/aux.sh
E1=$(evento 2 '100,00' rascunho); N1=$(nome "$E1"); echo "$E1 | $N1"
# passo 2: deslogado, a vitrine não mostra o rascunho
req c03a "$WEB/"; linha c03a "$E1"
# passo 4: publicado, aparece com 2 vagas e R$ 100,00
publicar c03b "$E1" | sed "s|$E1|<E1>|"
req c03c "$WEB/"; linha c03c "$E1"
# passo 5: conta nova pela interface compra com …0001; "Meus ingressos" mostra pendente e, em até 5 s, confirmado
P1="fluxo-$U@example.com"
cadastrar c03d "$T/c03.jar" "$P1"
comprar c03e "$T/c03.jar" "$E1" 4000000000000001; meus c03f "$T/c03.jar" '?ok=compra'
tem c03f '<p class="msg msg-success" role="status">Compra registrada</p>' '<h1>Meus ingressos</h1>'
ingressos c03f
C1=$(ingressos c03f | cut -d'|' -f5); K1=$(sql "SELECT id FROM tickets WHERE code = '$C1'"); echo "C1=$C1 K1=$K1"
idade "$K1" 5
meus c03g "$T/c03.jar"; ingressos c03g; naotem c03g 'Compra registrada'
janela "$K1" 2 5
sql "SELECT t.channel, u.email, t.price_paid_cents, t.event_id = '$E1' FROM tickets t JOIN users u ON u.id = t.buyer_user_id WHERE t.id = '$K1'"
# passo 6 (substituído, a API é da F07): um terceiro compra a última vaga com …0004, que fica pendente por 30–40 s
compra --evento "$E1" --cartao 4000000000000004 > "$T/c03h.txt"; semtempo < "$T/c03h.txt" | semid | sed "s|$E1|<E1>|"
K2=$(tkt "$T/c03h.txt")
# passo 7 (parte da vitrine), antes de completar 30 s da compra de K2
req c03i "$WEB/"; linha c03i "$E1"
req c03j -b "$T/c03.jar" "$WEB/eventos/$E1"; tem c03j '<dt>Vagas disponíveis</dt><dd>0</dd>'; bloco c03j "$E1"
comprar c03k "$T/c03.jar" "$E1" 4000000000000001; tem c03k '<p class="msg msg-error" role="alert">Ingressos esgotados</p>'
ningressos "$E1"
idade "$K2" 0
# depois da recusa de K2 (45 s da compra), a vaga volta à vitrine
idade "$K2" 45
req c03l "$WEB/"; linha c03l "$E1"
req c03m -b "$T/c03.jar" "$WEB/eventos/$E1"; bloco c03m "$E1"
ningressos "$E1"
```

Esperado:
- `<E1> | Evento F06 <U>-<k>`.
- `c03a`: `200`; nenhuma linha de `linha`.
- `c03b`: `302` e `location: /organizador/eventos/<E1>?ok=publicado`.
- `c03c`: `200`; a linha da vitrine com `<PROX_BR>`, `R$ 100,00`, vagas `2` e o link `Comprar`.
- `c03d`: `302`, `location: /` e [cria] (conta nova criada pela interface, já logada).
- `c03e`: [comprou]; `c03f`: `200` e nenhuma outra linha; dois `ok:` (`Compra registrada`).
- Exatamente uma linha: `<N1>|<PROX_BR>|pending|pendente|<C1>` (nome do evento, status `pendente` e código).
- `C1=<C1> K1=tkt_<16 caracteres>`.
- `confirmed|<x>` com x ≥ 5,0 (aos 5 s da compra o ingresso já está confirmado no banco).
- `c03g`: `200`; exatamente uma linha `<N1>|<PROX_BR>|confirmed|confirmado|<C1>` (mesmo código; recarregar mostra `confirmado`); `ausente: Compra registrada` (a mensagem só aparece logo depois da compra).
- `confirmed|<s>|dentro` com 2 ≤ s ≤ 5 (confirmado entre 2 e 5 s depois da compra, no relógio do banco).
- `vitrine|fluxo-<U>@example.com|10000|t` (compra pelo canal da vitrine, vinculada à conta nova, com o preço vigente).
- Exatamente:
  ```
  simulando 1 compra(s) simultânea(s) no evento <E1> pelo canal api
  compra 1/1: criada <ingresso> status pending valor 10000
  resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0
  vagas: lotação 2, ocupadas 2, disponíveis 0 (evento publicado)
  ```
- `c03i`: `200`; a linha da vitrine sem vagas: `… <td>R$ 100,00</td><td>0</td><td>Ingressos esgotados</td></tr>` (formato das convenções, `<PROX_BR>`).
- `c03j`: `200`; `ok:`; [esgotado] (o participante do passo 5 vê `Ingressos esgotados` no lugar do formulário).
- `c03k`: `409` e nenhuma outra linha; `ok:` (a tentativa de compra responde `Ingressos esgotados`).
- `2|2` (a tentativa não criou ingresso).
- `pending|<x>` com x < 30,0 (as verificações do passo 7 aconteceram antes de completar 30 s da compra pendente).
- `declined|<x>` com x ≥ 45,0.
- `c03l`: `200`; a linha da vitrine com vagas `1` e o link `Comprar` (a recusa liberou a vaga).
- `c03m`: `200`; [formulário].
- `2|1`.

#### C04 — Cartão inválido: `Número de cartão inválido` sem criar ingresso; espaços digitados são removidos

```bash
. /tmp/catraca-f06/aux.sh
E=$(evento 5 '100,00'); echo "$E"
cadastrar c04a "$T/c04.jar" "cartao-$U@example.com"
N0=$(ningressos "$E"); P0=$(sql "SELECT count(*) FROM payment_attempts")
i=0; for c in 400000000000001 40000000000000011 400000000000000A 4000-0000-0000-0001 ''; do i=$((i + 1)); printf '[%s] %s\n' "$c" "$(comprar "c04b$i" "$T/c04.jar" "$E" "$c" | head -n 1)"; done
for i in 1 2 3 4 5; do printf '%s/%s ' "$(conta "c04b$i" '<p class="msg msg-error" role="alert">Número de cartão inválido</p>')" "$(conta "c04b$i" 'Número de cartão inválido')"; done; echo
bloco c04b1 "$E"
naotem c04b1 '400000000000001'
naotem c04b4 '4000-0000-0000-0001'
req c04c -b "$T/c04.jar" -X POST "$WEB/eventos/$E/comprar"; conta c04c 'Número de cartão inválido'
echo "$N0 $(ningressos "$E") | $P0 $(sql "SELECT count(*) FROM payment_attempts")"
comprar c04d "$T/c04.jar" "$E" '4000 0000 0000 0001'
comprar c04e "$T/c04.jar" "$E" ' 4000000000000001 '
ningressos "$E"
sql "SELECT p.card_last4, t.channel FROM tickets t JOIN payment_attempts p ON p.origin = 'compra' AND p.reference = t.id WHERE t.event_id = '$E' ORDER BY t.created_at"
```

Esperado:
- `<E>`; `c04a`: `302`, `location: /` e [cria].
- Exatamente cinco linhas: `[400000000000001] 422`, `[40000000000000011] 422`, `[400000000000000A] 422`, `[4000-0000-0000-0001] 422`, `[] 422` (15 dígitos, 17 dígitos, letra, hífens e vazio).
- `1/1 1/1 1/1 1/1 1/1 ` (em cada resposta, `Número de cartão inválido` aparece exatamente uma vez, como mensagem de erro no topo).
- [formulário] (o formulário continua na página do evento).
- `ausente: 400000000000001` e `ausente: 4000-0000-0000-0001` (o número digitado não volta na página).
- `c04c`: `422` e nenhuma outra linha; `1` (envio sem o campo do cartão).
- `0|0 0|0 | <P0> <P0>` (nenhum ingresso e nenhuma tentativa de pagamento gravados).
- `c04d`: [comprou]; `c04e`: [comprou] (espaços digitados — no meio e nas pontas — são removidos antes da compra).
- `2|2`.
- Exatamente duas linhas `0001|vitrine` (as tentativas guardam só o final do cartão de 16 dígitos).

#### C05 — Compra enviada depois de as vagas acabarem: `Ingressos esgotados`, sem ingresso; página troca o formulário

```bash
. /tmp/catraca-f06/aux.sh
E=$(evento 1 '100,00'); echo "$E"
cadastrar c05a "$T/c05.jar" "esgotado-$U@example.com"
req c05b -b "$T/c05.jar" "$WEB/eventos/$E"; tem c05b '<dt>Vagas disponíveis</dt><dd>1</dd>'; bloco c05b "$E"
compra --evento "$E" --cartao 4000000000000001 | grep -E '^(resumo|vagas): '
comprar c05c "$T/c05.jar" "$E" 4000000000000001
tem c05c '<p class="msg msg-error" role="alert">Ingressos esgotados</p>' '<dt>Vagas disponíveis</dt><dd>0</dd>'; bloco c05c "$E"
ningressos "$E"
req c05d -b "$T/c05.jar" "$WEB/eventos/$E"; bloco c05d "$E"; naotem c05d "action=\"/eventos/$E/comprar\"" 'Número do cartão'
req c05e "$WEB/eventos/$E"; bloco c05e "$E"; naotem c05e 'Entrar para comprar'
req c05f "$WEB/"; linha c05f "$E"
meus c05g "$T/c05.jar"; tem c05g '<p>Você ainda não tem ingressos.</p>'
```

Esperado:
- `<E>`; `c05a`: `302`, `location: /` e [cria].
- `c05b`: `200`; `ok:`; [formulário] (o participante abriu a página com a última vaga).
- `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0` e `vagas: lotação 1, ocupadas 1, disponíveis 0 (evento publicado)` (um terceiro comprou a última vaga).
- `c05c`: `409` e nenhuma outra linha; dois `ok:`; [esgotado] (o formulário aberto antes, enviado depois de as vagas acabarem, responde `Ingressos esgotados`).
- `1|1` (só o ingresso do terceiro; a tentativa não criou ingresso).
- `c05d`: `200`; [esgotado]; dois `ausente:` (sem formulário de compra).
- `c05e`: `200`; [esgotado]; `ausente:` (o visitante também vê `Ingressos esgotados`).
- `c05f`: `200`; a linha da vitrine sem vagas (`<PROX_BR>`, `R$ 100,00`, `0`, `Ingressos esgotados`).
- `c05g`: `200`; `ok:` (a conta não ganhou ingresso).

#### C06 — R07 pela vitrine: 30 envios simultâneos em lotação 5, 3 rodadas em eventos novos

```bash
. /tmp/catraca-f06/aux.sh
R="rajada-$U@example.com"; cadastrar c06a "$T/c06.jar" "$R"
for r in 1 2 3; do
  E=$(evento 5 '10,00'); echo "rodada $r: $E"
  rajada "$T/c06.jar" "$E"
  echo "ingressos|ocupadas: $(ningressos "$E")"
  req "c06v$r" "$WEB/" > /dev/null; linha "c06v$r" "$E"
done
comprar c06b "$T/c06.jar" "$E" 4000000000000001; tem c06b '<p class="msg msg-error" role="alert">Ingressos esgotados</p>'
sql "SELECT count(*), count(DISTINCT t.event_id), count(DISTINCT t.code) FROM tickets t JOIN users u ON u.id = t.buyer_user_id WHERE lower(u.email) = lower('$R')"
meus c06c "$T/c06.jar"; ingressos c06c | grep -cE '\|[A-Z0-9]{8}$'
```

Esperado:
- `c06a`: `302`, `location: /` e [cria].
- Em **cada uma** das 3 rodadas, cada uma num evento novo:
  - `rodada <r>: <E>`;
  - exatamente duas linhas: `5 302` e `25 409` (5 compras aceitas e 25 recusadas por falta de vaga, com 30 envios simultâneos);
  - `ingressos|ocupadas: 5|5` (ingressos nunca são apagados e as recusas não gravam nada: as vagas ocupadas nunca passaram de 5);
  - a linha da vitrine sem vagas (`<PROX_BR>`, `R$ 10,00`, `0`, `Ingressos esgotados`).
  Qualquer rodada com outra contagem reprova o item.
- `c06b`: `409` e nenhuma outra linha; `ok:` (as respostas `409` da vitrine são `Ingressos esgotados`).
- `15|3|15` (15 ingressos da conta, 5 por evento, 15 códigos distintos).
- `15` (as 15 compras aparecem em "Meus ingressos").

#### C07 — Acesso: `Entrar para comprar`, volta ao evento, envio sem sessão e organizador

```bash
. /tmp/catraca-f06/aux.sh
E=$(evento 3 '100,00'); echo "$E"
X="acesso-$U@example.com"; cadastrar c07a "$T/c07x.jar" "$X"
# visitante: botão Entrar para comprar, login e volta ao evento
req c07b "$WEB/eventos/$E"; bloco c07b "$E"; naotem c07b 'action="/eventos/'
H=$(sed -n 's|^<p><a href="\(/entrar?voltar=[^"]*\)">Entrar para comprar</a></p>$|\1|p' "$T/c07b.html"); echo "$H" | sed "s|$E|<E>|"
req c07c -c "$T/c07v.jar" -b "$T/c07v.jar" "$WEB$H"; tem c07c "<input type=\"hidden\" name=\"voltar\" value=\"/eventos/$E\">"
req c07d -c "$T/c07v.jar" -b "$T/c07v.jar" --data-urlencode "email=$X" --data-urlencode 'senha=segredo123' --data-urlencode "voltar=/eventos/$E" "$WEB/entrar" | sed "s|$E|<E>|"
req c07e -b "$T/c07v.jar" "$WEB/eventos/$E"; bloco c07e "$E"
# envio da compra sem sessão, com sessão adulterada e de outra origem; Meus ingressos sem sessão
comprar c07f - "$E" 4000000000000001 | sed "s|$E|<E>|"
req c07g -b 'catraca_sessao=adulterado.adulterado' --data-urlencode 'cartao=4000000000000001' "$WEB/eventos/$E/comprar" | sed "s|$E|<E>|"
req c07h -b "$T/c07v.jar" -H 'Origin: http://evil.example' --data-urlencode 'cartao=4000000000000001' "$WEB/eventos/$E/comprar"; tem c07h '<h1>Requisição bloqueada</h1>'
req c07i "$WEB/meus-ingressos"
# organizadores
req c07j -b "$T/a.jar" "$WEB/eventos/$E"; bloco c07j "$E"; naotem c07j 'Entrar para comprar' 'action="/eventos/'
comprar c07k "$T/a.jar" "$E" 4000000000000001; bloco c07k "$E"
req c07l -b "$T/b.jar" "$WEB/eventos/$E"; bloco c07l "$E"
req c07m -b "$T/a.jar" "$WEB/meus-ingressos"; tem c07m '<h1>Acesso negado</h1><p>Esta página é exclusiva para participantes.</p>'
ningressos "$E"
```

Esperado:
- `<E>`; `c07a`: `302`, `location: /` e [cria].
- `c07b`: `200` e nenhuma outra linha; [entrar]; `ausente:` (o visitante não vê o formulário).
- `/entrar?voltar=%2Feventos%2F<E>` (o destino do botão `Entrar para comprar`).
- `c07c`: `200`; `ok:` (a página de login guarda a volta ao evento).
- `c07d`: `302`, `location: /eventos/<E>` e [cria] (depois de entrar como participante, volta à página do evento).
- `c07e`: `200`; [formulário].
- `c07f`: `302` e `location: /entrar?voltar=%2Feventos%2F<E>`, nenhuma outra linha.
- `c07g`: `302` e, em qualquer ordem, as linhas `location: /entrar?voltar=%2Feventos%2F<E>` e `set-cookie: catraca_sessao=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax` (sessão inválida = visitante, sem criar ingresso).
- `c07h`: `403`; `ok:` (envio de outra origem bloqueado pela F02).
- `c07i`: `302` e `location: /entrar?voltar=%2Fmeus-ingressos`.
- `c07j`: `200`; [organizador]; dois `ausente:` (o organizador A vê `Compras são feitas com uma conta de participante` no lugar do formulário).
- `c07k`: `403` e nenhuma outra linha; [organizador] (envio direto do organizador recusado com a mesma mensagem).
- `c07l`: `200`; [organizador] (o organizador B também).
- `c07m`: `403`; `ok:`.
- `0|0` (nenhum dos envios criou ingresso).

#### C08 — "Meus ingressos" só com as compras da vitrine da conta logada

```bash
. /tmp/catraca-f06/aux.sh
E=$(evento 10 '100,00'); echo "$E"
X="x-$U@example.com"; Y="y-$U@example.com"
cadastrar c08a "$T/c08x.jar" "$X"
cadastrar c08b "$T/c08y.jar" "$Y"
comprar c08c "$T/c08x.jar" "$E" 4000000000000003
comprar c08d "$T/c08y.jar" "$E" 4000000000000003
compra --evento "$E" --cartao 4000000000000003 --email "$X" > "$T/c08e.txt"; head -n 1 "$T/c08e.txt" | sed "s|$E|<E>|"
compra --evento "$E" --cartao 4000000000000003 --conta participante@catraca.test > "$T/c08f.txt"; head -n 1 "$T/c08f.txt" | sed "s|$E|<E>|"
sql "SELECT t.channel, coalesce(u.email, '-'), t.buyer_email FROM tickets t LEFT JOIN users u ON u.id = t.buyer_user_id WHERE t.event_id = '$E' ORDER BY t.created_at"
CX=$(banco "$X" | cut -d'|' -f5); CY=$(banco "$Y" | cut -d'|' -f5)
CA=$(sql "SELECT code FROM tickets WHERE event_id = '$E' AND channel = 'api'"); CP=$(grep -oE 'código [A-Z0-9]{8}' "$T/c08f.txt" | cut -d' ' -f2)
printf '%s\n' "$CX" "$CY" "$CA" "$CP" | grep -E '^[A-Z0-9]{8}$' | sort -u | wc -l | tr -d ' '
meus c08g "$T/c08x.jar"; ingressos c08g; naotem c08g "$CY" "$CA" "$CP"
diff <(ingressos c08g) <(banco "$X"); echo "diff=$?"
meus c08h "$T/c08y.jar"; ingressos c08h; naotem c08h "$CX" "$CA" "$CP"
diff <(ingressos c08h) <(banco "$Y"); echo "diff=$?"
```

Esperado:
- `<E>`; `c08a` e `c08b`: `302`, `location: /` e [cria] cada; `c08c` e `c08d`: [comprou] cada.
- `simulando 1 compra(s) simultânea(s) no evento <E> pelo canal api` e `simulando 1 compra(s) simultânea(s) no evento <E> pelo canal vitrine`.
- Exatamente quatro linhas, nesta ordem:
  ```
  vitrine|x-<U>@example.com|x-<U>@example.com
  vitrine|y-<U>@example.com|y-<U>@example.com
  api|-|x-<U>@example.com
  vitrine|participante@catraca.test|participante@catraca.test
  ```
  (a terceira é uma compra pelo canal da API com o e-mail de X, sem conta vinculada).
- `4` (quatro códigos distintos).
- `c08g`: `200`; exatamente uma linha `<N>|<PROX_BR>|pending|pendente|<CX>` (`<N>` = nome do evento); três `ausente:` (nem o ingresso de Y, nem a compra pela API com o e-mail de X, nem o do participante da seed); `diff=0`.
- `c08h`: `200`; exatamente uma linha `<N>|<PROX_BR>|pending|pendente|<CY>`; três `ausente:`; `diff=0`.

#### C09 — "Meus ingressos": do mais recente para o mais antigo, com os cinco rótulos e o nome do evento cancelado

```bash
. /tmp/catraca-f06/aux.sh
Ec=$(evento 5 '100,00'); Ed=$(evento 5 '100,00'); Ee=$(evento 5 '100,00'); Ef=$(evento 5 '100,00')
echo "$Ec $Ed $Ee $Ef"
Z="rotulos-$U@example.com"; cadastrar c09a "$T/c09.jar" "$Z"
comprar c09b "$T/c09.jar" "$Ec" 4000000000000001; K1=$(ultimo "$Z"); idade "$K1" 5
comprar c09c "$T/c09.jar" "$Ec" 4000000000000003
cancelar c09d "$Ec" | sed "s|$Ec|<Ec>|"
comprar c09e "$T/c09.jar" "$Ed" 4000000000000002
comprar c09f "$T/c09.jar" "$Ee" 4000000000000001; K4=$(ultimo "$Z")
comprar c09g "$T/c09.jar" "$Ef" 4000000000000003
idade "$K4" 6
meus c09h "$T/c09.jar"; ingressos c09h
diff <(ingressos c09h) <(banco "$Z"); echo "diff=$?"
ingressos c09h | cut -d'|' -f1,3,4 | sed -e "s#^$(nome "$Ef")|#Ef|#" -e "s#^$(nome "$Ee")|#Ee|#" -e "s#^$(nome "$Ed")|#Ed|#" -e "s#^$(nome "$Ec")|#Ec|#"
req c09i "$WEB/"; linha c09i "$Ec"
```

Esperado:
- Quatro ids; `c09a`: `302`, `location: /` e [cria].
- `c09b`: [comprou]; `confirmed|<x>` com x ≥ 5,0.
- `c09c`: [comprou].
- `c09d`: `302` e `location: /organizador/eventos/<Ec>?ok=cancelado`.
- `c09e`, `c09f`, `c09g`: [comprou] cada.
- `confirmed|<x>` com x ≥ 6,0.
- `c09h`: `200`; exatamente cinco linhas no formato `evento|data|status|rótulo|código`.
- `diff=0` (a página mostra exatamente os ingressos da conta, com os dados do banco, do mais recente para o mais antigo).
- Exatamente:
  ```
  Ef|pending|pendente
  Ee|confirmed|confirmado
  Ed|declined|recusado
  Ec|cancelled|cancelado
  Ec|refunded|estornado
  ```
  (o `…0003` de Ef ainda pendente; o `…0001` de Ee confirmado; o `…0002` de Ed recusado; no evento cancelado Ec, o pendente `…0003` cancelado e o confirmado `…0001` estornado — com o nome do evento cancelado).
- `c09i`: `200`; nenhuma linha de `linha` (o evento cancelado não está na vitrine, mas continua com nome em "Meus ingressos").

#### C10 — Vagas na vitrine = lotação − (pendentes + confirmados); recusado libera

```bash
. /tmp/catraca-f06/aux.sh
E=$(evento 5 '100,00'); echo "$E"
cadastrar c10a "$T/c10.jar" "vagas-$U@example.com"
comprar c10b "$T/c10.jar" "$E" 4000000000000001
compra --evento "$E" --cartao 4000000000000001 | grep -E '^resumo: '
compra --evento "$E" --cartao 4000000000000003 | grep -E '^resumo: '
compra --evento "$E" --cartao 4000000000000002 > "$T/c10c.txt"; grep -E '^resumo: ' "$T/c10c.txt"
req c10d "$WEB/"; linha c10d "$E"
req c10e "$WEB/eventos/$E"; tem c10e '<dt>Vagas disponíveis</dt><dd>1</dd>'
ningressos "$E"
K=$(tkt "$T/c10c.txt"); idade "$K" 6
req c10f "$WEB/"; linha c10f "$E"
req c10g "$WEB/eventos/$E"; tem c10g '<dt>Vagas disponíveis</dt><dd>2</dd>'
sql "SELECT e.capacity, count(*) FILTER (WHERE t.status = 'pending'), count(*) FILTER (WHERE t.status = 'confirmed'), count(*) FILTER (WHERE t.status = 'declined'), e.capacity - count(*) FILTER (WHERE t.status IN ('pending', 'confirmed')) FROM events e JOIN tickets t ON t.event_id = e.id WHERE e.id = '$E' GROUP BY e.capacity"
```

Esperado:
- `<E>`; `c10a`: `302`, `location: /` e [cria]; `c10b`: [comprou].
- Três linhas `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0`.
- `c10d`: `200`; a linha da vitrine com `<PROX_BR>`, `R$ 100,00`, vagas `1` e o link `Comprar` (5 − 4 ingressos ocupando vaga, pendentes ou confirmados, de vitrine e de terceiros).
- `c10e`: `200`; `ok:`.
- `4|4`.
- `declined|<x>` com x ≥ 6,0.
- `c10f`: `200`; a mesma linha com vagas `2` (o recusado liberou a vaga).
- `c10g`: `200`; `ok:`.
- `5|1|2|1|2` (lotação 5, 1 pendente, 2 confirmados, 1 recusado; 5 − 3 = 2, o número exibido).

### 2.2 Roteiro opcional no navegador (sem veredito)

Para quem quiser ver as mesmas telas: abrir `$WEB/` deslogado; criar e publicar um evento como organizador A (`$WEB/organizador`); sair; na vitrine, clicar no evento, em `Entrar para comprar`, em `Criar conta` e depois entrar com a conta nova; de volta à página do evento, comprar com `4000000000000001`; em "Meus ingressos", ver `Compra registrada`, o ingresso `pendente` e, recarregando depois de alguns segundos, `confirmado`. Este roteiro não substitui nenhum item.

### Encerramento (depois do C10)

```bash
rm -rf /tmp/catraca-f06
```

Sem veredito. O `npm run down` final é feito pela skill de avaliação.

## 3. Mapeamento critério → itens

| Critério (PRD) | Itens |
|----------------|-------|
| F06-CA01 | C01, C02 |
| F06-CA02 | C03, C09 |
| F06-CA03 | C05, C06, C03 |
| F06-CA04 | C04 |
| F06-CA05 | C07 |
| F06-CA06 | C08, C09 |
| F06-CA07 | C10, C01 |
| CF07 (F02 → F06) | C07, C08 |
| CF08 (F04 → F06) | C02, C09 |
| CF09 (F05 → F06) | C03, C05, C10 |

Notas do mapeamento:
- **F06-CA01:** C01 confere a vitrine deslogada (nome, data e hora no fuso do produto, local, preço `R$ 1.234,56`/`R$ 100,00`, vagas, ordem pela data de início, eventos de dois organizadores, rascunho ausente); C02 confere o rascunho fora da vitrine e da página pública.
- **F06-CA02 / CF09 (passo 5 do Fluxo do avaliador):** C03 cria a conta pela interface, compra com `4000000000000001`, vê `Compra registrada`, o ingresso `pendente` com o nome do evento e o código, e aos 5 s `confirmado` (com a janela 2–5 s conferida no banco); C09 mostra o mesmo ingresso nos outros status ao recarregar.
- **F06-CA03 / R07 (passo 7 do Fluxo, parte da vitrine):** C05 é o critério literal (página com `Ingressos esgotados` no lugar do formulário; formulário aberto antes e enviado depois de as vagas acabarem → `Ingressos esgotados`, sem ingresso); C06 prova que a vitrine passa pela garantia de lotação do serviço sob 30 envios simultâneos, em 3 rodadas com eventos novos; C03 mostra o esgotamento causado por um pendente de terceiro (`…0004`) antes de 30 s e a vaga voltando depois da recusa.
- **F06-CA05 / CF07:** C07 cobre o botão `Entrar para comprar` → `/entrar` → volta ao evento, `/meus-ingressos` sem sessão → `/entrar`, envio sem sessão ou com sessão adulterada (volta ao login sem criar ingresso) e o organizador vendo `Compras são feitas com uma conta de participante` (página e envio direto). C08 cobre a outra metade do CF07 (uma conta nunca vê ingressos de outra).
- **F06-CA06:** C08 (outra conta, compra pelo canal `api` com o mesmo e-mail e compra de terceiro pelo canal `vitrine` com outra conta ficam fora) e C09 (ordem do mais recente para o mais antigo e os cinco rótulos). As compras "pela API" são criadas com o `catraca compra:simular --email` da F05, que usa o mesmo serviço e o mesmo canal `api` que a F07 vai usar.
- **F06-CA07:** C10 (pendentes e confirmados ocupam, recusado libera, vitrine e página iguais ao banco); C01 (sem compras, vagas = lotação).
- **CF08 (F04 → F06):** C02 (rascunho ausente, publicado presente, cancelado sai da vitrine, página `404` e compra recusada com o formulário já aberto); C09 (evento cancelado fora da vitrine, mas com o nome em "Meus ingressos").
- **CF09 (F05 → F06):** C03 (nasce `pendente`, `confirmado` em até 5 s, código; `Ingressos esgotados` quando o serviço indica 0 vagas por um pendente de terceiro), C05 (recusa `sold_out` do serviço vira `Ingressos esgotados`), C10 (vagas exibidas = vagas do serviço).

## 4. Fora deste contrato

- **API de parceiros (F07, mesma wave):** rotas `/api/partner/...`, `X-Api-Key`, `availableSeats`, rajada pela API e a parte da API dos passos 2, 4, 6, 7 e 8 do Fluxo do avaliador. Aqui, compras "de terceiros" e "pela API" são criadas pelo `compra:simular` da F05 (canal `api`), sem passar por HTTP.
- **Check-in (F08) e painel (F09):** inclusive CF19 (vendas da vitrine e da API juntas no painel), que pertence ao contrato da F09.
- Regras internas do serviço de compra (trava, ordem das recusas, resposta tardia do gateway, guarda do banco) e os tempos do gateway em si: contratos da F05 e da F03. Criação, edição, publicação, cancelamento e isolamento de eventos em si: contrato da F04. Cadastro, login, sessão e checagem de origem em si: contrato da F02. Aqui elas são usadas como superfícies para preparar os cenários.
- Cancelamento ou transferência de ingresso pelo participante, busca e paginação na vitrine, atualização em tempo real: fora de escopo do PRD.

## 5. Alterações do contrato

Nenhuma.
