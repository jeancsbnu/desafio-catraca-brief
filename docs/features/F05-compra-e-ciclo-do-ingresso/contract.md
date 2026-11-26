# Contrato: F05 — Compra e ciclo do ingresso

## 1. Pré-requisitos de ambiente

- **Commit avaliado:** o avaliador registra o hash no relatório (`git rev-parse HEAD` na raiz do repositório avaliado — `main`, branch ou worktree da F05).
- **Onde roda:** na raiz da pasta do repositório avaliado, num shell `bash` (Linux, macOS ou WSL). Cada bloco do roteiro começa com `. /tmp/catraca-f05/aux.sh` (criado na Preparação), que entra na raiz do repositório e define variáveis e funções; por isso os blocos podem rodar em shells separados.
- **Subir:** `npm run up` · **Derrubar:** `npm run down` · **Gates:** `npm run gates` (comandos do `AGENTS.md`; nenhum `npm install`). Conforme a skill `evaluate-feature`, o avaliador roda `npm run down` e `npm run up` antes da Preparação.
- **Endereços:** `$WEB` = `$API` = `http://localhost:3000`; se a pasta avaliada tiver um `.env` com `CATRACA_PORT`, a Preparação usa essa porta. **Chave de parceiro:** `parceiro-catraca-dev` (README); não é usada neste contrato — a API de parceiros é da F07.
- **Contas da seed:** organizador A (`organizador.a@catraca.test`), organizador B (`organizador.b@catraca.test`), participante (`participante@catraca.test`); senha `catraca123` para as três, conforme o README (seção "Credenciais"). O contrato usa o organizador A (criar, publicar, editar e cancelar eventos pela interface da F04) e o participante (compra pelo canal `vitrine` no C06).
- **Modo:** padrão — gateway simulado com os **tempos reais do brief** (`…0001`/`…0002` em 2–5 s, `…0003`/`…0004` em 30–40 s). Nenhuma variável `GATEWAY_*` no shell nem no `.env`; um `.env` local só é aceito com `CATRACA_PORT` e/ou `COMPOSE_PROJECT_NAME` (conferido na Preparação).
- **Superfícies usadas:** só as de F01–F05: interface HTTP da gestão de eventos da F04 (com o cookie do organizador A), os comandos `catraca compra:simular` e `catraca ingresso:consultar` da F05 (dentro do container `app`), consultas SQL de leitura no container `db`, os logs do container `app` e o `npm run gates`. Nenhum item usa vitrine, API de parceiros, check-in ou painel.
- **Como medir tempo:** as janelas do brief são conferidas no relógio do banco: `tickets.created_at` (instante da compra), `tickets.status_changed_at` (instante da mudança de status) e `payment_attempts` (solicitação e entrega). O relógio do host só é usado para esperar: a função `idade` espera o ingresso completar N segundos de vida (no relógio do banco) e então mostra o status naquele instante.
- **Ferramentas do avaliador:** `bash`, `git`, `curl`, `awk`, `sed`, `grep`, `sort`, `wc`, `docker` com Compose v2, `node` (LTS), `npm`.
- **Datas:** a Preparação calcula `PROX` = dia 15 do mês seguinte, 21:00 (`AAAA-MM-DDTHH:MM`, fuso `America/Sao_Paulo`), usada em todos os eventos.
- **Ordem e dados:** os itens rodam na ordem numérica. Cada item cria os próprios eventos (função `evento`, nomes `Evento F05 <U>-<n>`, sufixo `$U` único por avaliação) e as próprias compras, e não depende de outro item. Dados criados: eventos do organizador A (alguns publicados, rascunhos e cancelados), ingressos e tentativas de pagamento. Nenhuma conta nova. As únicas escritas fora das superfícies do produto são as duas tentativas de `UPDATE` do C12, que o banco recusa (nada muda).
- **Duração:** cerca de 8 minutos para C01–C14 (C02, C12 e C14 esperam de 41 a 46 s cada; C05 leva cerca de 30 s), mais o C15, que constrói a imagem dos gates e pode levar alguns minutos — use um tempo-limite de pelo menos 10 minutos para esse comando.

### Preparação (antes do C01)

```bash
# na raiz do repositório avaliado, com o ambiente já subido por npm run up
git status --porcelain | wc -l
git rev-parse HEAD
env | grep -c '^GATEWAY_'
if [ -e .env ]; then grep -vE '^[[:space:]]*(#|$)' .env | grep -cvE '^(CATRACA_PORT|COMPOSE_PROJECT_NAME)='; else echo "sem .env"; fi
mkdir -p /tmp/catraca-f05 && rm -rf /tmp/catraca-f05/*
printf "cd '%s'\n" "$(git rev-parse --show-toplevel)" > /tmp/catraca-f05/aux.sh
printf 'U=%s\n' "$(date +%s)" >> /tmp/catraca-f05/aux.sh
TZ=America/Sao_Paulo node -e '
const p = (n) => String(n).padStart(2, "0");
const h = new Date();
const a = new Date(h.getFullYear(), h.getMonth() + 1, 15);
console.log(`PROX=${a.getFullYear()}-${p(a.getMonth() + 1)}-${p(a.getDate())}T21:00`);
' >> /tmp/catraca-f05/aux.sh
cat >> /tmp/catraca-f05/aux.sh <<'EOF'
T=/tmp/catraca-f05
PORTA=${CATRACA_PORT:-$(sed -n 's/^CATRACA_PORT=//p' .env 2>/dev/null | tail -n 1)}
WEB=http://localhost:${PORTA:-3000}
# req <id> [opções do curl] <url>: imprime o status HTTP e as linhas location/set-cookie; corpo em $T/<id>.html
req() { _id=$1; shift; curl -s -o "$T/$_id.html" -D "$T/$_id.h" -w '%{http_code}\n' "$@"; tr -d '\r' < "$T/$_id.h" | awk '{ i = index($0, ":"); n = tolower(substr($0, 1, i - 1)); if (n == "location" || n == "set-cookie") print n ":" substr($0, i + 1) }'; }
sql() { docker compose exec -T db psql -U catraca -d catraca -At -c "$1" < /dev/null; }
entrar() { req "$1" -c "$2" -b "$2" --data-urlencode "email=$3" --data-urlencode "senha=catraca123" "$WEB/entrar"; }
# evento <lotação> <preço> [rascunho]: cria um evento novo do organizador A pela F04 (e publica, salvo "rascunho"); imprime o id
evento() {
  _k=$(( $(cat "$T/k" 2>/dev/null || echo 0) + 1 )); echo "$_k" > "$T/k"
  _s=$(req "ev$_k" -b "$T/a.jar" --data-urlencode "nome=Evento F05 $U-$_k" --data-urlencode "inicio=$PROX" --data-urlencode "local=Local F05 $U" --data-urlencode "lotacao=$1" --data-urlencode "preco=$2" "$WEB/organizador/eventos" | head -n 1)
  _e=$(tr -d '\r' < "$T/ev$_k.h" | sed -n 's|^[Ll]ocation: /organizador/eventos/\(evt_[a-z0-9]\{16\}\)?ok=criado$|\1|p')
  if [ "$_s" != 302 ] || [ -z "$_e" ]; then echo "FALHA: criar evento respondeu $_s" >&2; return 1; fi
  if [ "${3-}" != rascunho ]; then
    _s=$(req "pu$_k" -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$_e/publicar" | head -n 1)
    if [ "$_s" != 302 ]; then echo "FALHA: publicar respondeu $_s" >&2; return 1; fi
  fi
  echo "$_e"
}
# editar <id> <evento> <lotação> <preço>: POST de edição da F04 mantendo nome, data e local
editar() { _n=$(sql "SELECT name FROM events WHERE id = '$2'"); req "$1" -b "$T/a.jar" --data-urlencode "nome=$_n" --data-urlencode "inicio=$PROX" --data-urlencode "local=Local F05 $U" --data-urlencode "lotacao=$3" --data-urlencode "preco=$4" "$WEB/organizador/eventos/$2/editar"; }
# cancelar <id> <evento>: cancelamento confirmado pela F04
cancelar() { req "$1" -b "$T/a.jar" --data-urlencode 'confirmar=sim' "$WEB/organizador/eventos/$2/cancelar"; }
compra() { docker compose exec -T app catraca compra:simular "$@" < /dev/null; }
consultar() { docker compose exec -T app catraca ingresso:consultar "$@" < /dev/null; }
# tkt <arquivo> [n]: n-ésimo id de ingresso que aparece no arquivo
tkt() { grep -oE 'tkt_[a-z0-9]{16}' "$1" | sed -n "${2:-1}p"; }
# semtempo: tira o " em <S> s" do fim das linhas de compra (filtro)
semtempo() { sed 's/ em [0-9]*,[0-9]* s$//'; }
# semid: troca "tkt_… código XXXXXXXX" por "<ingresso>" (filtro)
semid() { sed -E 's/tkt_[a-z0-9]{16} código [A-Z0-9]{8}/<ingresso>/'; }
# rapidas <arquivo>: compras com duração < 1 s / total de compras do arquivo
rapidas() { awk '/^compra [0-9]+\/[0-9]+: / { t++; d = $(NF-1); sub(",", ".", d); if (d + 0 < 1) r++ } END { print r + 0 "/" t + 0 }' "$1"; }
# idade <tkt> <s>: espera o ingresso completar <s> segundos desde a criação (relógio do banco) e imprime status|idade
idade() { _r=$(sql "SELECT greatest(0, $2 - EXTRACT(EPOCH FROM clock_timestamp() - created_at)) FROM tickets WHERE id = '$1'"); sleep "${_r:-0}"; sql "SELECT status, round(EXTRACT(EPOCH FROM clock_timestamp() - created_at)::numeric, 1) FROM tickets WHERE id = '$1'"; }
# janela <tkt> <a> <b>: status|segundos entre a criação e a última mudança de status|dentro ou fora de [a; b]
janela() { sql "SELECT status, round(EXTRACT(EPOCH FROM status_changed_at - created_at)::numeric, 3), CASE WHEN EXTRACT(EPOCH FROM status_changed_at - created_at) BETWEEN $2 AND $3 THEN 'dentro' ELSE 'fora' END FROM tickets WHERE id = '$1'"; }
# pagto <tkt>: final do cartão|resultado|entregue|segundos entre solicitação e entrega da tentativa do ingresso
pagto() { sql "SELECT card_last4, result, delivered_at IS NOT NULL, round(EXTRACT(EPOCH FROM delivered_at - requested_at)::numeric, 1) FROM payment_attempts WHERE origin = 'compra' AND reference = '$1'"; }
# ocupadas <evento>: ingressos pending+confirmed|total de ingressos do evento
ocupadas() { sql "SELECT count(*) FILTER (WHERE status IN ('pending', 'confirmed')), count(*) FROM tickets WHERE event_id = '$1'"; }
# ignorado <tkt>: quantas linhas de log "resultado do gateway ignorado" o container app registrou para o ingresso
ignorado() { docker compose logs --no-log-prefix app | grep -F "$1" | grep -cF '"msg":"ingressos: resultado do gateway ignorado"'; }
# monitorar <evento> <segundos>: dentro do container do banco, amostra as vagas ocupadas do evento sem parar e imprime o máximo visto
monitorar() { docker compose exec -T db sh -s -- "$1" "$2" < "$T/monitor.sh"; }
EOF
cat > /tmp/catraca-f05/monitor.sh <<'EOF'
E=$1
fim=$(( $(date +%s) + $2 ))
m=0
n=0
while [ "$(date +%s)" -lt "$fim" ]; do
  o=$(psql -U catraca -d catraca -At -c "SELECT count(*) FROM tickets WHERE event_id = '$E' AND status IN ('pending', 'confirmed')")
  if [ "$o" -gt "$m" ]; then m=$o; fi
  n=$((n + 1))
done
echo "max ocupadas: $m em $n amostras"
EOF
. /tmp/catraca-f05/aux.sh
sed -n '2,3p' /tmp/catraca-f05/aux.sh
curl -s -w '\n%{http_code}\n' "$WEB/health"
sql "SELECT to_regclass('public.events') IS NOT NULL, to_regclass('public.payment_attempts') IS NOT NULL, to_regclass('public.tickets') IS NOT NULL"
docker compose exec -T app catraca help < /dev/null | grep -cE '^  (compra:simular|ingresso:consultar|gateway:simular) '
docker compose logs --no-log-prefix app | grep -F '[catraca] módulos:' | tail -n 1
docker compose logs --no-log-prefix app | grep -F '"msg":"gateway: worker iniciado"' | tail -n 1 | grep -cE '"escala":1[,}]'
entrar pa "$T/a.jar" organizador.a@catraca.test
monitorar evt_0000000000000000 1
```

Esperado:
- `0` (árvore limpa); o hash do commit; `0` (nenhuma variável `GATEWAY_*` no shell); `sem .env` ou `0` (o `.env` só tem `CATRACA_PORT`/`COMPOSE_PROJECT_NAME`).
- Duas linhas: `U=<número>` e `PROX=<AAAA-MM>-15T21:00` (mês seguinte ao atual).
- `{"status":"ok"}` e `200`.
- `t|t|t` (as tabelas de eventos, tentativas de pagamento e ingressos existem).
- `3` (o `help` lista `compra:simular`, `ingresso:consultar` e `gateway:simular`).
- A linha de boot `[catraca] módulos: …` com `eventos, ingressos` nessa ordem (o módulo da F05 carrega logo depois do da F04).
- `1` (o worker do gateway está no ar com escala 1, os tempos do brief).
- `pa`: `302`, `location: /organizador` e uma linha `set-cookie: catraca_sessao=…`.
- `max ocupadas: 0 em <n> amostras` com `n` ≥ 1 (o monitor funciona dentro do container do banco).

Sem isso, o contrato não é executável.

**Convenções dos resultados esperados:**
- A saída de `req` (e de `editar`/`cancelar`) é o status na primeira linha e, depois, as linhas `location:`/`set-cookie:`. "Nenhuma outra linha" quer dizer que a resposta não tem `location` nem `set-cookie`.
- `evento` imprime só o id `evt_<16 caracteres [a-z0-9]>`; se imprimir `FALHA: …`, a superfície da F04 falhou e o item é ✗ `não executável`.
- `<E>`, `<K>`, `<C>`, `<U>` etc. indicam o valor da variável no momento da execução; `<S>` é a duração em segundos com vírgula (`0,04`); `<x>`, `<s>`, `<d>` são números conferidos pela faixa indicada.
- Linhas da `compra:simular` (formato literal da spec, 5.9): cabeçalho `simulando <N> compra(s) simultânea(s) no evento <evento> pelo canal <api|vitrine>`; uma linha `compra <i>/<N>: criada <tkt> código <CÓDIGO> status pending valor <centavos> em <S> s` ou `compra <i>/<N>: recusada <motivo> em <S> s` por compra; `resumo: criadas <a>, sold_out <b>, event_not_available <c>, invalid_request <d>, erros <e>`; `vagas: lotação <l>, ocupadas <o>, disponíveis <v> (evento <status>)` ou `vagas: evento não encontrado`.

## 2. Itens verificáveis

A tabela é o índice. Os comandos exatos e o resultado completo de cada item estão no roteiro 2.1, que prevalece sobre o resumo.

| ID | Item | Tipo | Como verificar (resumo) | Resultado esperado (resumo) | Regras |
|----|------|------|-------------------------|-----------------------------|--------|
| C01 | Compra com `…0001` responde na hora com `pending`, `tkt_…` e código; fica `confirmed` entre 2 e 5 s | TEMPO | Evento publicado (lotação 5); `compra:simular`; `idade` 1 s e 6 s; janela no banco; `ingresso:consultar` | Linha `criada tkt_… código … status pending valor 10000` em menos de 1 s; `pending` aos ~1 s; `confirmed` com 2 ≤ janela ≤ 5 s; tentativa `0001` aprovada; consulta completa | R06, R08, R09 |
| C02 | Pendente `…0004` ocupa vaga; a recusa (30–40 s) deixa `declined` e libera a vaga | TEMPO | Lotação 2; compra `…0004`; consultas logo após, aos 25 s e aos 41 s; janela | 1 vaga disponível enquanto `pending` (inclusive aos 25 s); `declined` com 30 ≤ janela ≤ 40 s; 2 vagas disponíveis | R05, R06, R08 |
| C03 | Cartão de 15, 17 dígitos ou não numérico é `invalid_request` antes de criar ingresso | CLI + DB | Quatro cartões inválidos; rajada de 3; cartão inválido em rascunho e em evento inexistente; e-mail inválido; usos inválidos da CLI; contagens | `recusada invalid_request` em todos (antes de `event_not_available`); contagem de ingressos e de tentativas inalterada; usos inválidos saem com 2 | R06 (brief: 16 dígitos) |
| C04 | Sem vaga: `sold_out` e nenhum ingresso criado | CLI + DB | Lotação 1 com 1 `confirmed`; nova compra; lotação 1 com 1 `pending` (`…0003`) e 3 compras simultâneas | `recusada sold_out`; `disponíveis 0`; ingressos do evento continuam 1 | R05, R07 |
| C05 | Rajada de R07: 30 compras simultâneas em lotação 5, 3 rodadas em eventos novos | CLI + DB | `compra:simular --paralelas 30` com monitor de ocupadas em paralelo, em 3 eventos novos; contagens; confirmação | Em cada rodada: exatamente 5 criadas e 25 `sold_out`; 5 ingressos, 5 códigos distintos; máximo de ocupadas observado = 5; depois, 5 `confirmed` por evento | R05, R07 |
| C06 | Rajada mista vitrine + API no mesmo evento respeita a lotação | CLI + DB | Dois `compra:simular --paralelas 15` simultâneos, um com `--conta participante@catraca.test`, outro por e-mail, em lotação 5 | Total de 5 criadas e 25 `sold_out`; ingressos da vitrine com a conta do participante, da API sem conta; 5 ocupadas | R05, R07 |
| C07 | A trava é por evento: compra do mesmo evento espera, de outro evento não | CLI + DB | Sessão SQL segura a trava da linha do evento A por 4 s; compras simultâneas em A e em B | B criada em menos de 1 s e antes da liberação; A criada só depois da liberação (esperou ≥ 0,5 s) | R06, R07 |
| C08 | Código: 8 caracteres `A-Z0-9`, único no sistema, encontrado com espaços e minúsculas | CLI + DB | 20 compras simultâneas; formato e duplicidade em todos os ingressos; índice único e `CHECK`; `ingresso:consultar` com código em minúsculas e espaços; código inexistente | 20 códigos válidos e distintos; nenhum código inválido ou repetido no sistema; índice único; consulta normalizada encontra; `ZZZZZZZZ` → não encontrado | R09 |
| C09 | A compra grava o preço vigente: 10000, 10000 e 15000 | CLI + HTTP + DB | Duas compras a R$ 100,00; edição do preço para R$ 150,00 pela F04; terceira compra | Linhas `valor 10000`, `valor 10000`, `valor 15000`; banco na mesma ordem; consulta `valor pago: 15000 centavos` | R03 |
| C10 | CF05: lotação abaixo das vagas ocupadas é rejeitada; igual e maior são aceitas | HTTP + CLI + DB | Lotação 3 com 1 `confirmed` + 1 `pending`; editar para 1, 2 e 4; compras entre as edições | `422` com `A lotação não pode ficar menor que as vagas ocupadas` e lotação inalterada; `302` para 2 (compra seguinte `sold_out`) e para 4 (compra seguinte criada) | R03, R05 |
| C11 | Rascunho, evento inexistente e id inválido: `event_not_available` | CLI + HTTP + DB | Compra em rascunho, em `evt_0000000000000000` e em `nao-e-um-evento`; depois publicar e comprar | `recusada event_not_available` sem criar ingresso; depois de publicar, a compra é criada | R02 |
| C12 | Cancelamento com `confirmed` e `pending` (`…0003`): `refunded`/`cancelled` em até 10 s, `cancelled` continua após 45 s, vagas 0 | TEMPO | Compra `…0001` confirmada e `…0003` pendente; cancelar pela F04; consultas; espera até 46 s da compra pendente; tentativa, log, nova compra, guarda do banco | Logo após o cancelamento: `refunded` e `cancelled`, mesma transação (`status_changed_at = cancelled_at`), vagas 0; aos 46 s continua `cancelled`, sem mudança, apesar de o gateway ter aprovado (log "ignorado"); compra `event_not_available`; banco recusa voltar a `confirmed` | R05, R08, R11 |
| C13 | Evento cancelado: 0 vagas e compra `event_not_available` | CLI + HTTP + DB | Evento publicado sem compras; cancelar pela F04; comprar | `recusada event_not_available`; `vagas: lotação 3, ocupadas 0, disponíveis 0 (evento cancelado)`; nenhum ingresso | R05, R11 |
| C14 | CF04: `…0002` → `declined` entre 2 e 5 s e libera a vaga; `…0003` → `pending` aos 29 s e `confirmed` até 40 s | TEMPO | Lotação 1 com `…0002`; janela; compra seguinte; lotação 1 com `…0003`; `idade` 29 s e 41 s; janela | `declined` com 2 ≤ janela ≤ 5 s e vaga livre de novo (vendida em seguida); `pending` aos 29 s; `confirmed` com 30 ≤ janela ≤ 40 s | R08 |
| C15 | Testes de concorrência da F05 passam nos gates | TEST | `npm run gates -- test/f05/concorrencia.test.ts` | `exit=0`; `testes: ok (N executados, 0 falharam)` com N ≥ 8 e o filtro; `resultado: OK` | R05, R07 |

### 2.1 Roteiro detalhado

Todos os comandos rodam a partir da raiz do repositório (o `aux.sh` faz o `cd`).

#### C01 — Compra com `…0001` responde na hora com `pending`, `tkt_…` e código; fica `confirmed` entre 2 e 5 s

```bash
. /tmp/catraca-f05/aux.sh
E=$(evento 5 '100,00'); echo "$E"
compra --evento "$E" --cartao 4000000000000001 > "$T/c01.txt"; echo "exit=$?"
cat "$T/c01.txt"
rapidas "$T/c01.txt"
K=$(tkt "$T/c01.txt"); C=$(grep -oE 'código [A-Z0-9]{8}' "$T/c01.txt" | cut -d' ' -f2); echo "$K $C"
idade "$K" 1
idade "$K" 6
janela "$K" 2 5
pagto "$K"
consultar "$K" > "$T/c01b.txt"; echo "exit=$?"
cat "$T/c01b.txt"
sql "SELECT code = '$C', status, price_paid_cents, channel, buyer_user_id IS NULL, buyer_email, event_id = '$E' FROM tickets WHERE id = '$K'"
```

Esperado:
- `<E>` no formato `evt_` + 16 caracteres; `exit=0`.
- Exatamente 4 linhas:
  ```
  simulando 1 compra(s) simultânea(s) no evento <E> pelo canal api
  compra 1/1: criada <K> código <C> status pending valor 10000 em <S> s
  resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0
  vagas: lotação 5, ocupadas 1, disponíveis 4 (evento publicado)
  ```
  com `<K>` casando com `tkt_[a-z0-9]{16}` e `<C>` com `[A-Z0-9]{8}`.
- `1/1` (o serviço respondeu em menos de 1 s, sem esperar o gateway).
- A linha `<K> <C>`.
- `pending|<x>` com 1,0 ≤ x < 2,0 (o ingresso ainda pendente 1 s depois da compra).
- `confirmed|<x>` com x ≥ 6,0.
- `confirmed|<s>|dentro` (2 ≤ s ≤ 5: confirmado entre 2 e 5 s depois da compra, no relógio do banco).
- `0001|aprovado|t|<d>` com 2 ≤ d ≤ 5 (a tentativa de pagamento do ingresso guarda só o final do cartão).
- `exit=0` e exatamente estas 13 linhas, nesta ordem:
  ```
  ingresso: <K>
  código: <C>
  evento: <E> (publicado)
  status: confirmed (confirmado)
  check-in: não
  valor pago: 10000 centavos
  canal: api
  comprador: simulacao-1@example.com
  conta: -
  criado em: <data ISO com -03:00>
  status desde: <data ISO com -03:00>
  pagamento: pay_<16 caracteres> (cartão final 0001, aprovado, entregue <X> s após a solicitação)
  vagas do evento: lotação 5, ocupadas 1, disponíveis 4
  ```
- `t|confirmed|10000|api|t|simulacao-1@example.com|t`.

#### C02 — Pendente `…0004` ocupa vaga; a recusa (30–40 s) deixa `declined` e libera a vaga

```bash
. /tmp/catraca-f05/aux.sh
E=$(evento 2 '100,00'); echo "$E"
compra --evento "$E" --cartao 4000000000000004 > "$T/c02.txt"; echo "exit=$?"
semtempo < "$T/c02.txt" | semid
K=$(tkt "$T/c02.txt")
consultar "$K" | grep -E '^(status|pagamento|vagas do evento): '
idade "$K" 25
consultar "$K" | grep -E '^(status|vagas do evento): '
idade "$K" 41
janela "$K" 30 40
consultar "$K" | grep -E '^(status|vagas do evento): '
ocupadas "$E"
pagto "$K"
```

Esperado:
- `<E>`; `exit=0`; exatamente:
  ```
  simulando 1 compra(s) simultânea(s) no evento <E> pelo canal api
  compra 1/1: criada <ingresso> status pending valor 10000
  resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0
  vagas: lotação 2, ocupadas 1, disponíveis 1 (evento publicado)
  ```
- `status: pending (pendente)`, `pagamento: pay_<16> (cartão final 0004, aguardando o gateway)`, `vagas do evento: lotação 2, ocupadas 1, disponíveis 1`.
- `pending|<x>` com 25,0 ≤ x < 26,5; depois `status: pending (pendente)` e `vagas do evento: lotação 2, ocupadas 1, disponíveis 1` (o pendente continua ocupando a vaga).
- `declined|<x>` com x ≥ 41,0.
- `declined|<s>|dentro` (30 ≤ s ≤ 40).
- `status: declined (recusado)` e `vagas do evento: lotação 2, ocupadas 0, disponíveis 2` (a recusa liberou a vaga).
- `0|1` (o único ingresso do evento não ocupa mais vaga).
- `0004|recusado|t|<d>` com 30 ≤ d ≤ 40.

#### C03 — Cartão de 15, 17 dígitos ou não numérico é `invalid_request` antes de criar ingresso

```bash
. /tmp/catraca-f05/aux.sh
E=$(evento 5 '100,00'); R=$(evento 5 '100,00' rascunho); echo "$E $R"
N0=$(sql "SELECT count(*) FROM tickets"); P0=$(sql "SELECT count(*) FROM payment_attempts")
for c in 400000000000001 40000000000000011 400000000000000A '4000 0000 0000 0001'; do printf '[%s] ' "$c"; compra --evento "$E" --cartao "$c" | grep -E '^compra ' | semtempo; done
compra --evento "$E" --cartao 400000000000001 --paralelas 3 | grep -E '^(resumo|vagas): '
compra --evento "$R" --cartao 123 | grep -E '^compra ' | semtempo
compra --evento evt_0000000000000000 --cartao 123 | grep -E '^compra ' | semtempo
compra --evento "$E" --cartao 4000000000000001 --email nao-e-um-email | grep -E '^compra ' | semtempo
echo "$N0 $(sql "SELECT count(*) FROM tickets") | $P0 $(sql "SELECT count(*) FROM payment_attempts")"
ocupadas "$E"
compra --evento "$E" 2>&1; echo "exit=$?"
compra --evento "$E" --cartao 4000000000000001 --conta organizador.a@catraca.test 2>&1; echo "exit=$?"
compra --evento "$E" --cartao 4000000000000001 --paralelas 51 2>&1; echo "exit=$?"
echo "$N0 $(sql "SELECT count(*) FROM tickets")"
```

Esperado:
- `<E> <R>`.
- Exatamente 4 linhas: `[400000000000001] compra 1/1: recusada invalid_request`, `[40000000000000011] compra 1/1: recusada invalid_request`, `[400000000000000A] compra 1/1: recusada invalid_request`, `[4000 0000 0000 0001] compra 1/1: recusada invalid_request`.
- `resumo: criadas 0, sold_out 0, event_not_available 0, invalid_request 3, erros 0` e `vagas: lotação 5, ocupadas 0, disponíveis 5 (evento publicado)`.
- `compra 1/1: recusada invalid_request` três vezes (rascunho e evento inexistente com cartão inválido: o cartão é verificado antes do evento; e-mail mal formado).
- Dois pares de números iguais: `<N0> <N0> | <P0> <P0>` (nenhum ingresso e nenhuma tentativa de pagamento gravados).
- `0|0`.
- `Uso: catraca compra:simular --evento <id> --cartao <número> [--email <e-mail> | --conta <e-mail de participante>] [--paralelas <1 a 50>]` e `exit=2`.
- `Conta de participante não encontrada: organizador.a@catraca.test` e `exit=2`.
- A mesma linha `Uso: …` e `exit=2`.
- `<N0> <N0>`.

#### C04 — Sem vaga: `sold_out` e nenhum ingresso criado

```bash
. /tmp/catraca-f05/aux.sh
E=$(evento 1 '100,00'); echo "$E"
compra --evento "$E" --cartao 4000000000000001 > "$T/c04a.txt"; grep -E '^(resumo|vagas): ' "$T/c04a.txt"
K=$(tkt "$T/c04a.txt"); idade "$K" 6
compra --evento "$E" --cartao 4000000000000001 > "$T/c04b.txt"; echo "exit=$?"
semtempo < "$T/c04b.txt"
ocupadas "$E"
E2=$(evento 1 '100,00'); echo "$E2"
compra --evento "$E2" --cartao 4000000000000003 | grep -E '^(resumo|vagas): '
compra --evento "$E2" --cartao 4000000000000001 --paralelas 3 | grep -E '^(resumo|vagas): '
ocupadas "$E2"
```

Esperado:
- `<E>`; `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0` e `vagas: lotação 1, ocupadas 1, disponíveis 0 (evento publicado)`.
- `confirmed|<x>` com x ≥ 6,0.
- `exit=0` e exatamente:
  ```
  simulando 1 compra(s) simultânea(s) no evento <E> pelo canal api
  compra 1/1: recusada sold_out
  resumo: criadas 0, sold_out 1, event_not_available 0, invalid_request 0, erros 0
  vagas: lotação 1, ocupadas 1, disponíveis 0 (evento publicado)
  ```
- `1|1` (nenhum ingresso novo).
- `<E2>`; `resumo: criadas 1, …` e `vagas: lotação 1, ocupadas 1, disponíveis 0 (evento publicado)`; depois `resumo: criadas 0, sold_out 3, event_not_available 0, invalid_request 0, erros 0` e a mesma linha de vagas (o pendente ocupa a vaga).
- `1|1`.

#### C05 — Rajada de R07: 30 compras simultâneas em lotação 5, 3 rodadas em eventos novos

```bash
. /tmp/catraca-f05/aux.sh
rm -f "$T/c05-eventos.txt"
for r in 1 2 3; do
  E=$(evento 5 '10,00') || break
  echo "$E" >> "$T/c05-eventos.txt"
  monitorar "$E" 8 > "$T/c05-mon$r.txt" &
  M=$!
  sleep 1
  compra --evento "$E" --cartao 4000000000000001 --paralelas 30 > "$T/c05-$r.txt"; X=$?
  wait "$M"
  echo "rodada $r | exit=$X | criadas $(grep -cE '^compra [0-9]+/30: criada tkt_' "$T/c05-$r.txt") | sold_out $(grep -cE '^compra [0-9]+/30: recusada sold_out ' "$T/c05-$r.txt") | linhas $(grep -cE '^compra [0-9]+/30: ' "$T/c05-$r.txt")"
  grep -E '^(resumo|vagas): ' "$T/c05-$r.txt"
  sql "SELECT count(*), count(DISTINCT code), count(*) FILTER (WHERE status IN ('pending', 'confirmed')) FROM tickets WHERE event_id = '$E'"
  cat "$T/c05-mon$r.txt"
done
sleep 2
while read -r E; do sql "SELECT count(*) FILTER (WHERE status = 'confirmed'), count(*) FROM tickets WHERE event_id = '$E'"; done < "$T/c05-eventos.txt"
```

Esperado:
- Para **cada uma** das 3 rodadas, exatamente estas 5 linhas:
  ```
  rodada <r> | exit=0 | criadas 5 | sold_out 25 | linhas 30
  resumo: criadas 5, sold_out 25, event_not_available 0, invalid_request 0, erros 0
  vagas: lotação 5, ocupadas 5, disponíveis 0 (evento publicado)
  5|5|5
  max ocupadas: 5 em <n> amostras
  ```
  com `n` ≥ 10 (5 ingressos com 5 códigos distintos, 5 ocupando vaga; o monitor, rodando em paralelo durante toda a rajada, nunca viu mais que 5 ocupadas).
- Depois, exatamente 3 linhas `5|5` (os 5 ingressos de cada evento ficaram `confirmed`).
- O item só passa se as três rodadas derem exatamente esse resultado. Como ingressos nunca são apagados e uma recusa não grava nada, `5` ingressos no total de cada evento também prova que as vagas ocupadas nunca passaram de 5.

#### C06 — Rajada mista vitrine + API no mesmo evento respeita a lotação

```bash
. /tmp/catraca-f05/aux.sh
E=$(evento 5 '10,00'); echo "$E"
compra --evento "$E" --cartao 4000000000000001 --paralelas 15 --conta participante@catraca.test > "$T/c06v.txt" &
V=$!
compra --evento "$E" --cartao 4000000000000001 --paralelas 15 > "$T/c06a.txt"; XA=$?
wait "$V"; XV=$?
echo "exit vitrine=$XV api=$XA"
head -n 1 "$T/c06v.txt"; head -n 1 "$T/c06a.txt"
cat "$T/c06v.txt" "$T/c06a.txt" | grep -E '^resumo: '
echo "criadas $(cat "$T/c06v.txt" "$T/c06a.txt" | grep -cE ': criada tkt_') sold_out $(cat "$T/c06v.txt" "$T/c06a.txt" | grep -cE ': recusada sold_out ')"
sql "SELECT t.channel, count(*), bool_and(CASE WHEN t.channel = 'vitrine' THEN t.buyer_user_id = u.id AND t.buyer_email = 'participante@catraca.test' ELSE t.buyer_user_id IS NULL END) FROM tickets t LEFT JOIN users u ON lower(u.email) = 'participante@catraca.test' WHERE t.event_id = '$E' GROUP BY t.channel ORDER BY t.channel"
ocupadas "$E"
```

Esperado:
- `<E>`; `exit vitrine=0 api=0`.
- `simulando 15 compra(s) simultânea(s) no evento <E> pelo canal vitrine` e `simulando 15 compra(s) simultânea(s) no evento <E> pelo canal api`.
- Duas linhas `resumo: criadas <a>, sold_out <b>, event_not_available 0, invalid_request 0, erros 0`, cujos `criadas` somam 5 e `sold_out` somam 25.
- `criadas 5 sold_out 25`.
- Uma ou duas linhas entre `api|<a>|t` e `vitrine|<v>|t`, com a + v = 5 (vitrine com a conta e o e-mail do participante; API sem conta).
- `5|5`.

#### C07 — A trava é por evento: compra do mesmo evento espera, de outro evento não

```bash
. /tmp/catraca-f05/aux.sh
EA=$(evento 5 '10,00'); EB=$(evento 5 '10,00'); echo "$EA $EB"
cat > "$T/c07.sql" <<SQL
DO \$\$ BEGIN
  PERFORM id FROM events WHERE id = '$EA' FOR UPDATE;
  RAISE NOTICE 'trava obtida %', clock_timestamp();
  PERFORM pg_sleep(4);
  RAISE NOTICE 'trava liberada %', clock_timestamp();
END \$\$;
SQL
docker compose exec -T db psql -U catraca -d catraca -q < "$T/c07.sql" > "$T/c07-trava.txt" 2>&1 &
TR=$!
for i in $(seq 50); do [ "$(sql "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%trava obtida%' AND pid <> pg_backend_pid()")" = 1 ] && break; sleep 0.2; done
sleep 0.3
compra --evento "$EA" --cartao 4000000000000001 > "$T/c07a.txt" &
PA=$!
compra --evento "$EB" --cartao 4000000000000001 > "$T/c07b.txt"
wait "$PA"; wait "$TR"
grep -hE '^compra 1/1: ' "$T/c07b.txt" | semid
grep -hE '^compra 1/1: ' "$T/c07a.txt" | semid
L=$(sed -n 's/.*trava liberada //p' "$T/c07-trava.txt"); echo "liberada: $L"
sql "SELECT event_id = '$EB', created_at < '$L'::timestamptz FROM tickets WHERE event_id IN ('$EA', '$EB') ORDER BY created_at"
```

Esperado:
- `<EA> <EB>`.
- `compra 1/1: criada <ingresso> status pending valor 1000 em <S> s` com S < 1,00 (evento B: não esperou a trava de A).
- `compra 1/1: criada <ingresso> status pending valor 1000 em <S> s` com S ≥ 0,50 (evento A: esperou a trava e, ao obtê-la, comprou normalmente).
- `liberada: <data e hora>` (não vazio).
- Exatamente 2 linhas, nesta ordem: `t|t` (o ingresso de B foi criado enquanto A estava travado) e `f|f` (o ingresso de A só foi criado depois da liberação).

#### C08 — Código: 8 caracteres `A-Z0-9`, único no sistema, encontrado com espaços e minúsculas

```bash
. /tmp/catraca-f05/aux.sh
E=$(evento 20 '10,00'); echo "$E"
compra --evento "$E" --cartao 4000000000000001 --paralelas 20 > "$T/c08.txt"
grep -E '^resumo: ' "$T/c08.txt"
grep -oE 'código [^ ]+' "$T/c08.txt" | cut -d' ' -f2 > "$T/c08-codigos.txt"
echo "$(wc -l < "$T/c08-codigos.txt" | tr -d ' ') $(grep -cE '^[A-Z0-9]{8}$' "$T/c08-codigos.txt") $(sort -u "$T/c08-codigos.txt" | wc -l | tr -d ' ')"
sql "SELECT count(*) >= 20, count(*) FILTER (WHERE code !~ '^[A-Z0-9]{8}\$'), count(*) - count(DISTINCT code) FROM tickets"
sql "SELECT indexdef FROM pg_indexes WHERE tablename = 'tickets' AND indexname = 'tickets_code_key'"
sql "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'tickets_code_format'"
K=$(tkt "$T/c08.txt" 3); C=$(sql "SELECT code FROM tickets WHERE id = '$K'"); M=$(printf '%s' "$C" | tr 'A-Z' 'a-z'); echo "$K $C $M"
consultar "  $M  " | grep -E '^(ingresso|código): '
consultar "$C" | grep -E '^ingresso: '
consultar ZZZZZZZZ 2>&1; echo "exit=$?"
consultar 2>&1; echo "exit=$?"
```

Esperado:
- `<E>`; `resumo: criadas 20, sold_out 0, event_not_available 0, invalid_request 0, erros 0`.
- `20 20 20` (20 códigos, todos com 8 caracteres `A-Z0-9`, todos distintos).
- `t|0|0` (nenhum ingresso do sistema com código fora do formato, nenhum código repetido).
- `CREATE UNIQUE INDEX tickets_code_key ON public.tickets USING btree (code)`.
- `CHECK ((code ~ '^[A-Z0-9]{8}$'::text))`.
- `<K> <C> <c em minúsculas>`; depois `ingresso: <K>` e `código: <C>` (a consulta com espaços nas pontas e minúsculas encontra o ingresso); `ingresso: <K>`.
- `Ingresso não encontrado: ZZZZZZZZ` e `exit=1`.
- `Uso: catraca ingresso:consultar <id do ingresso (tkt_…) ou código>` e `exit=2`.

#### C09 — A compra grava o preço vigente: 10000, 10000 e 15000

```bash
. /tmp/catraca-f05/aux.sh
E=$(evento 5 '100,00'); echo "$E"
compra --evento "$E" --cartao 4000000000000001 --paralelas 2 | grep -E '^(compra|resumo)' | semtempo | semid
editar c09 "$E" 5 '150,00'
sql "SELECT price_cents FROM events WHERE id = '$E'"
compra --evento "$E" --cartao 4000000000000001 | grep -E '^compra ' | semtempo | semid
sql "SELECT price_paid_cents FROM tickets WHERE event_id = '$E' ORDER BY created_at, id"
K3=$(sql "SELECT id FROM tickets WHERE event_id = '$E' ORDER BY created_at DESC, id DESC LIMIT 1")
consultar "$K3" | grep -E '^valor pago: '
```

Esperado:
- `<E>`; exatamente `compra 1/2: criada <ingresso> status pending valor 10000`, `compra 2/2: criada <ingresso> status pending valor 10000` e `resumo: criadas 2, sold_out 0, event_not_available 0, invalid_request 0, erros 0`.
- `c09`: `302` e `location: /organizador/eventos/<E>?ok=atualizado`; `15000`.
- `compra 1/1: criada <ingresso> status pending valor 15000`.
- Exatamente 3 linhas: `10000`, `10000`, `15000` (a mudança de preço não alterou as compras anteriores).
- `valor pago: 15000 centavos`.

#### C10 — CF05: lotação abaixo das vagas ocupadas é rejeitada; igual e maior são aceitas

```bash
. /tmp/catraca-f05/aux.sh
E=$(evento 3 '100,00'); echo "$E"
compra --evento "$E" --cartao 4000000000000001 | grep -E '^resumo: '
compra --evento "$E" --cartao 4000000000000003 | grep -E '^(resumo|vagas): '
ocupadas "$E"
editar c10a "$E" 1 '100,00'
grep -cF 'A lotação não pode ficar menor que as vagas ocupadas' "$T/c10a.html"
sql "SELECT capacity FROM events WHERE id = '$E'"
editar c10b "$E" 2 '100,00'
sql "SELECT capacity FROM events WHERE id = '$E'"
compra --evento "$E" --cartao 4000000000000001 | grep -E '^(compra|vagas)' | semtempo
editar c10c "$E" 4 '100,00'
compra --evento "$E" --cartao 4000000000000001 | grep -E '^(resumo|vagas): '
ocupadas "$E"
```

Esperado:
- `<E>`; `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0`; de novo a mesma linha de resumo e `vagas: lotação 3, ocupadas 2, disponíveis 1 (evento publicado)` (um `confirmed`/`pending` com `…0001` e um `pending` com `…0003`).
- `2|2`.
- `c10a`: `422` e nenhuma outra linha; `1` (a mensagem exata aparece); `3` (a lotação não mudou).
- `c10b`: `302` e `location: /organizador/eventos/<E>?ok=atualizado`; `2` (lotação igual às vagas ocupadas é aceita).
- `compra 1/1: recusada sold_out` e `vagas: lotação 2, ocupadas 2, disponíveis 0 (evento publicado)`.
- `c10c`: `302` e `location: /organizador/eventos/<E>?ok=atualizado` (aumentar é aceito).
- `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0` e `vagas: lotação 4, ocupadas 3, disponíveis 1 (evento publicado)`.
- `3|3`.

#### C11 — Rascunho, evento inexistente e id inválido: `event_not_available`

```bash
. /tmp/catraca-f05/aux.sh
R=$(evento 5 '100,00' rascunho); echo "$R"
sql "SELECT status FROM events WHERE id = '$R'"
compra --evento "$R" --cartao 4000000000000001 > "$T/c11.txt"; echo "exit=$?"
semtempo < "$T/c11.txt"
for e in evt_0000000000000000 nao-e-um-evento; do compra --evento "$e" --cartao 4000000000000001 | grep -E '^(compra|resumo|vagas)' | semtempo; done
ocupadas "$R"
req c11p -b "$T/a.jar" -X POST "$WEB/organizador/eventos/$R/publicar"
compra --evento "$R" --cartao 4000000000000001 | grep -E '^(resumo|vagas): '
```

Esperado:
- `<R>`; `rascunho`; `exit=0` e exatamente:
  ```
  simulando 1 compra(s) simultânea(s) no evento <R> pelo canal api
  compra 1/1: recusada event_not_available
  resumo: criadas 0, sold_out 0, event_not_available 1, invalid_request 0, erros 0
  vagas: lotação 5, ocupadas 0, disponíveis 5 (evento rascunho)
  ```
- Duas vezes as 3 linhas `compra 1/1: recusada event_not_available`, `resumo: criadas 0, sold_out 0, event_not_available 1, invalid_request 0, erros 0`, `vagas: evento não encontrado`.
- `0|0`.
- `c11p`: `302` e `location: /organizador/eventos/<R>?ok=publicado`.
- `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0` e `vagas: lotação 5, ocupadas 1, disponíveis 4 (evento publicado)`.

#### C12 — Cancelamento com `confirmed` e `pending` (`…0003`): `refunded`/`cancelled` em até 10 s, `cancelled` continua após 45 s, vagas 0

```bash
. /tmp/catraca-f05/aux.sh
E=$(evento 5 '50,00'); echo "$E"
compra --evento "$E" --cartao 4000000000000001 > "$T/c12a.txt"; K6=$(tkt "$T/c12a.txt")
idade "$K6" 6
compra --evento "$E" --cartao 4000000000000003 > "$T/c12b.txt"; K5=$(tkt "$T/c12b.txt"); echo "$K6 $K5"
consultar "$K5" | grep -E '^status: '
cancelar c12c "$E"
consultar "$K6" | grep -E '^(status|vagas do evento): '
consultar "$K5" | grep -E '^(status|vagas do evento): '
sql "SELECT t.id = '$K6', t.status, t.status_changed_at = e.cancelled_at, EXTRACT(EPOCH FROM clock_timestamp() - e.cancelled_at) <= 10, EXTRACT(EPOCH FROM e.cancelled_at - t.created_at) < 30 FROM tickets t JOIN events e ON e.id = t.event_id WHERE t.event_id = '$E' ORDER BY t.created_at"
S5=$(sql "SELECT status_changed_at FROM tickets WHERE id = '$K5'")
idade "$K5" 46
sql "SELECT status, status_changed_at = '$S5'::timestamptz FROM tickets WHERE id = '$K5'"
pagto "$K5"
ignorado "$K5"
consultar "$K5" | grep -E '^(status|pagamento|vagas do evento): '
compra --evento "$E" --cartao 4000000000000001 | grep -E '^(compra|vagas)' | semtempo
ocupadas "$E"
sql "UPDATE tickets SET status = 'confirmed' WHERE id = '$K5'" 2>&1 | grep -c 'transição de status inválida'
sql "UPDATE tickets SET status = 'confirmed' WHERE id = '$K6'" 2>&1 | grep -c 'transição de status inválida'
sql "SELECT status FROM tickets WHERE event_id = '$E' ORDER BY created_at"
```

Esperado:
- `<E>`; `confirmed|<x>` com x ≥ 6,0; `<K6> <K5>`; `status: pending (pendente)`.
- `c12c`: `302` e `location: /organizador/eventos/<E>?ok=cancelado`.
- `status: refunded (estornado)` e `vagas do evento: lotação 5, ocupadas 0, disponíveis 0`.
- `status: cancelled (cancelado)` e `vagas do evento: lotação 5, ocupadas 0, disponíveis 0`.
- Exatamente 2 linhas: `t|refunded|t|t|t` e `f|cancelled|t|t|t` (o confirmado ficou estornado e o pendente cancelado na própria transação do cancelamento — `status_changed_at` igual ao `cancelled_at` do evento —, observado a menos de 10 s do cancelamento, que aconteceu antes de completar 30 s da compra pendente).
- `cancelled|<x>` com x ≥ 46,0.
- `cancelled|t` (o status e o instante da última mudança continuam os do cancelamento).
- `0003|aprovado|t|<d>` com 30 ≤ d ≤ 40 (o gateway respondeu, aprovando, depois do cancelamento).
- `1` (a resposta tardia foi ignorada e registrada no log).
- `status: cancelled (cancelado)`, `pagamento: pay_<16> (cartão final 0003, aprovado, entregue <X> s após a solicitação)` e `vagas do evento: lotação 5, ocupadas 0, disponíveis 0`.
- `compra 1/1: recusada event_not_available` e `vagas: lotação 5, ocupadas 0, disponíveis 0 (evento cancelado)`.
- `0|2`.
- `1` e `1` (o banco recusa levar um ingresso cancelado ou estornado de volta a `confirmed`).
- Exatamente `refunded` e `cancelled`.

#### C13 — Evento cancelado: 0 vagas e compra `event_not_available`

```bash
. /tmp/catraca-f05/aux.sh
E=$(evento 3 '100,00'); echo "$E"
cancelar c13a "$E"
sql "SELECT status FROM events WHERE id = '$E'"
compra --evento "$E" --cartao 4000000000000001 > "$T/c13.txt"; echo "exit=$?"
semtempo < "$T/c13.txt"
ocupadas "$E"
```

Esperado:
- `<E>`; `c13a`: `302` e `location: /organizador/eventos/<E>?ok=cancelado`; `cancelado`.
- `exit=0` e exatamente:
  ```
  simulando 1 compra(s) simultânea(s) no evento <E> pelo canal api
  compra 1/1: recusada event_not_available
  resumo: criadas 0, sold_out 0, event_not_available 1, invalid_request 0, erros 0
  vagas: lotação 3, ocupadas 0, disponíveis 0 (evento cancelado)
  ```
- `0|0`.

#### C14 — CF04: `…0002` → `declined` entre 2 e 5 s e libera a vaga; `…0003` → `pending` aos 29 s e `confirmed` até 40 s

```bash
. /tmp/catraca-f05/aux.sh
E=$(evento 1 '100,00'); echo "$E"
compra --evento "$E" --cartao 4000000000000002 > "$T/c14a.txt"; grep -E '^(compra|vagas)' "$T/c14a.txt" | semtempo | semid
K=$(tkt "$T/c14a.txt")
idade "$K" 6
janela "$K" 2 5
pagto "$K"
consultar "$K" | grep -E '^(status|vagas do evento): '
compra --evento "$E" --cartao 4000000000000001 | grep -E '^(resumo|vagas): '
E3=$(evento 1 '100,00'); echo "$E3"
compra --evento "$E3" --cartao 4000000000000003 > "$T/c14b.txt"; grep -E '^resumo: ' "$T/c14b.txt"
K3=$(tkt "$T/c14b.txt")
idade "$K3" 29
idade "$K3" 41
janela "$K3" 30 40
pagto "$K3"
consultar "$K3" | grep -E '^(status|vagas do evento): '
```

Esperado:
- `<E>`; `compra 1/1: criada <ingresso> status pending valor 10000` e `vagas: lotação 1, ocupadas 1, disponíveis 0 (evento publicado)` (o pendente ocupa a única vaga).
- `declined|<x>` com x ≥ 6,0.
- `declined|<s>|dentro` (2 ≤ s ≤ 5).
- `0002|recusado|t|<d>` com 2 ≤ d ≤ 5.
- `status: declined (recusado)` e `vagas do evento: lotação 1, ocupadas 0, disponíveis 1` (a recusa liberou a vaga).
- `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0` e `vagas: lotação 1, ocupadas 1, disponíveis 0 (evento publicado)` (a vaga liberada foi vendida de novo).
- `<E3>`; `resumo: criadas 1, sold_out 0, event_not_available 0, invalid_request 0, erros 0`.
- `pending|<x>` com 29,0 ≤ x < 30,5 (aos 29 s ainda pendente; ver alteração A1 na seção 5).
- `confirmed|<x>` com x ≥ 41,0.
- `confirmed|<s>|dentro` (30 ≤ s ≤ 40).
- `0003|aprovado|t|<d>` com 30 ≤ d ≤ 40.
- `status: confirmed (confirmado)` e `vagas do evento: lotação 1, ocupadas 1, disponíveis 0`.

#### C15 — Testes de concorrência da F05 passam nos gates

```bash
. /tmp/catraca-f05/aux.sh
grep -c 'F05-CA05' app/test/f05/concorrencia.test.ts
npm run gates -- test/f05/concorrencia.test.ts > "$T/c15.txt" 2>&1; echo "exit=$?"
grep -E '^\[gates\] ' "$T/c15.txt"
```

Esperado:
- O `grep -c` imprime um número ≥ 4 (os testes de rajada levam o ID do critério no nome).
- `exit=0`.
- Entre as linhas `[gates] …` (além da linha do projeto Compose dos gates): `[gates] lint: ok`, `[gates] typecheck: ok`, `[gates] testes: ok (N executados, 0 falharam) [filtro: test/f05/concorrencia.test.ts]` com `N` ≥ 8 e `[gates] resultado: OK` (rajadas de 30 compras em 30 conexões reais contra o PostgreSQL dos gates, repetidas em eventos novos, inclusive com edição de lotação e cancelamento concorrentes).

### Encerramento (depois do C15)

```bash
rm -rf /tmp/catraca-f05
```

Sem veredito. O `npm run down` final é feito pela skill de avaliação.

## 3. Mapeamento critério → itens

| Critério (PRD) | Itens |
|----------------|-------|
| F05-CA01 | C01 |
| F05-CA02 | C02 |
| F05-CA03 | C03 |
| F05-CA04 | C04 |
| F05-CA05 | C05, C06, C07, C15 |
| F05-CA06 | C08 |
| F05-CA07 | C09 |
| F05-CA08 | C12 |
| F05-CA09 | C13, C12 |
| F05-CA10 | C11 |
| CF04 (F03 → F05) | C14, C01, C02 |
| CF05 (F04 → F05) | C10, C09, C11 |
| CF06 (F04 → F05) | C12 |

Notas do mapeamento:
- **F05-CA05 / R07:** C05 é a verificação principal (30 compras simultâneas em lotação 5, 3 rodadas, cada uma num evento novo, com monitor das vagas ocupadas durante a rajada). C06 estende a garantia a compras simultâneas pelos dois canais (PRD F05: "nem com compras simultâneas pela vitrine e pela API"). C07 mostra o mecanismo em execução: a trava é da linha do evento (a compra do mesmo evento espera; a de outro evento não) — e cobre também a parte "responde sem esperar" de R06 sob trava alheia. C15 roda os testes de concorrência da spec (rajadas repetidas, rajadas em vários eventos ao mesmo tempo, corrida com edição de lotação e com cancelamento).
- **CF04 (F03 → F05):** C14 cobre literalmente o critério (`…0002` recusado entre 2 e 5 s liberando a vaga; `…0003` pendente aos 29 s e confirmado até 40 s); C01 (`…0001` confirmado em 2–5 s) e C02 (`…0004` recusado em 30–40 s liberando a vaga) completam a tabela do gateway chegando ao ingresso.
- **CF05 (F04 → F05):** rascunho recusado como `event_not_available` (C11), preço vigente da F04 gravado na compra (C09), lotação abaixo das vagas ocupadas rejeitada com `A lotação não pode ficar menor que as vagas ocupadas` e aumento aceito, com `pending` contando como ocupada (C10). Os eventos são criados, publicados e editados pela interface da F04.
- **CF06 e F05-CA08 (F04 → F05):** C12 cancela pela página de gestão da F04 um evento com um `confirmed` e um `pending` de cartão `…0003`, antes de completar 30 s da compra pendente: em até 10 s `refunded`/`cancelled` (na mesma transação), 46 s depois da compra pendente continua `cancelled` mesmo com o gateway tendo aprovado, e as vagas disponíveis do evento são 0. A recusa do banco a voltar para `confirmed` é a guarda de R11 da spec. C12 também cobre F05-CA09 com ingressos; C13 cobre F05-CA09 num evento cancelado sem compras.
- **Rótulos e campos:** a linha `status:` do `ingresso:consultar` mostra o valor da API e o rótulo do brief (`pending (pendente)`, `confirmed (confirmado)`, `declined (recusado)`, `cancelled (cancelado)`, `refunded (estornado)`), e `check-in: não` mostra que `checkedIn` é informação à parte (PRD F05 Capacidades).

## 4. Fora deste contrato

- **CF07, CF09 (→ F06):** compra pela vitrine, `Ingressos esgotados`, "Meus ingressos" e mensagens da vitrine — contrato da F06 (a F05 só provê o serviço e as consultas; o canal `vitrine` com conta é exercitado aqui pela CLI no C06).
- **CF11, CF12, CF13 (→ F07):** rotas `/api/partner/...`, `X-Api-Key`, códigos HTTP `202`/`422`/`404`/`409`, `availableSeats` e a rajada pela API — contrato da F07. A garantia de lotação do serviço já é verificada aqui (C05–C07, C15).
- **CF15 (→ F08) e CF14:** mensagens e ordem do check-in (R10) — contrato da F08. A operação atômica `markTicketCheckedIn` e a busca por código normalizado são cobertas pelos testes da F05 (`consultas.test.ts`, executados no `G1`) e, na parte de busca, pelo C08.
- **CF17, CF18, CF19, CF20 (→ F09):** números do painel — contrato da F09; `summarizeEventTickets` é coberta pelos testes da F05 (`G1`).
- Tempos e entrega única do gateway em si (sorteio, reinício, escala de atraso): F03 (contrato da F03). Criação, publicação, edição, cancelamento e isolamento de eventos em si: F04 (contrato da F04); aqui a F04 é usada só como superfície para preparar os cenários.
- Devolução real de dinheiro, desfazer check-in, mais de um ingresso por compra: fora de escopo do PRD.

## 5. Alterações do contrato

- **A1 — 2026-11-26, antes da primeira avaliação (pedida pelo orquestrador).** C14, leitura "aos 29 s": o limite superior passou de `x < 30,0` para `x < 30,5`. Motivo: a leitura é feita por `docker compose exec`, cuja latência medida variou de 0,2 a 1,3 s, de modo que uma leitura iniciada aos 29 s pode terminar depois de 30,0 s. Como o status de um ingresso nunca volta a `pending`, ler `pending` em qualquer instante ≥ 29,0 s prova que o ingresso estava pendente aos 29 s (o que o CF04 exige); o limite de 30,5 s mantém a leitura colada aos 29 s. Nenhuma expectativa sobre o produto mudou: a confirmação continua exigida entre 30 e 40 s.
