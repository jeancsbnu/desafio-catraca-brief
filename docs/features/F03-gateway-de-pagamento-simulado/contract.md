# Contrato: F03 — Gateway de pagamento simulado

## 1. Pré-requisitos de ambiente

- **Commit avaliado:** o avaliador registra o hash no relatório (`git rev-parse HEAD` na raiz do repositório avaliado — worktree da F03 ou `main`).
- **Subir:** `npm run up` · **Derrubar:** `npm run down` · **Gates:** `npm run gates` (na raiz do repositório; nenhum `npm install`). Conforme a skill `evaluate-feature`, o avaliador roda `npm run down` e `npm run up` antes da Preparação.
- **Endereços:** `$WEB` = `$API` = `http://localhost:3000` (ou a porta do `CATRACA_PORT` do `.env` local da worktree; a Preparação calcula `$WEB`). **Chave de parceiro e contas da seed:** não são usadas neste contrato (a F03 não tem rotas nem telas).
- **Modo:** padrão — nenhuma variável `GATEWAY_*` no shell nem no `.env`. Em worktree, um `.env` local é aceito **somente** com `CATRACA_PORT` e/ou `COMPOSE_PROJECT_NAME` (isolamento de ambiente, `AGENTS.md` regra 8); nenhuma variável dele chega ao gateway (conferido no C11). Os únicos desvios do modo padrão são os comandos com `-e` do C09, que valem só para o processo daquele comando.
- **Ferramentas do avaliador:** `bash`, `git`, `curl`, `docker` com Compose v2, `npm`, `awk`, `grep`, `sed`.
- **Como medir tempo:** as janelas do brief (2–5 s, 30–40 s) são conferidas no relógio do banco (`requested_at` e `delivered_at` da tabela `payment_attempts`) e na linha de resultado do `gateway:simular`; o relógio do host só é usado para esperar (`sleep`).
- **Ordem e independência:** os itens rodam na ordem numérica. Cada bloco começa com `. /tmp/catraca-f03/aux.sh` (criado na Preparação), então não depende de variáveis de um bloco anterior. Cada item cria as próprias tentativas de pagamento. C06 e C07 reiniciam e param o container `app`; ao fim do C07 ele está no ar de novo.
- **Duração:** cerca de 10 minutos (C03, C04, C06 e C07 esperam de 30 a 60 s cada; o C10 constrói a imagem dos gates e pode levar alguns minutos — use um tempo-limite de pelo menos 10 minutos para esse comando).

### Preparação (antes do C01)

```bash
# na raiz do repositório avaliado, com o ambiente já subido por npm run up
mkdir -p /tmp/catraca-f03 && rm -f /tmp/catraca-f03/*
printf "cd '%s'\n" "$(git rev-parse --show-toplevel)" > /tmp/catraca-f03/aux.sh
cat >> /tmp/catraca-f03/aux.sh <<'EOF'
S=/tmp/catraca-f03
PORTA=${CATRACA_PORT:-$(sed -n 's/^CATRACA_PORT=//p' .env 2>/dev/null | tail -n 1)}
WEB=http://localhost:${PORTA:-3000}
sql() { docker compose exec -T db psql -U catraca -d catraca -At -c "$1"; }
simular() { docker compose exec -T app catraca gateway:simular "$@"; }
pay_de() { grep -oE 'pay_[a-z0-9]{16}' "$1" | head -n 1; }
tentativa() { sql "SELECT origin, result, card_last4, delay_ms, delivery_attempts, delivered_at IS NOT NULL, round(EXTRACT(EPOCH FROM delivered_at - requested_at)::numeric, 3) FROM payment_attempts WHERE id = '$1'"; }
janela() { sql "SELECT EXTRACT(EPOCH FROM delivered_at - requested_at) BETWEEN $2 AND $3, delivered_at >= due_at, delay_ms BETWEEN $2 * 1000 AND $3 * 1000 FROM payment_attempts WHERE id = '$1'"; }
faixa() { awk -v a="$2" -v b="$3" '/^(aprovado|recusado) em [0-9]+,[0-9] s$/ { n = $3; sub(",", ".", n); print $1, n, ((n + 0 >= a + 0 && n + 0 <= b + 0) ? "dentro" : "fora") }' "$1"; }
linha1() { grep -cE "^solicitação pay_[a-z0-9]{16} registrada em 0,[0-9] s \\(cartão final $2, modo simulado, escala $3\\)\$" "$1"; }
entregas() { docker compose logs --no-log-prefix app | grep -F "$1" | grep -cF '"msg":"gateway: resultado entregue"'; }
esperar_linha1() { for i in $(seq 150); do grep -q '^solicitação ' "$1" && return 0; sleep 0.1; done; echo "linha 1 não apareceu em 15 s"; return 1; }
saude() { for i in $(seq 300); do curl -sf -o /dev/null "$WEB/health" && break; sleep 0.2; done; curl -s "$WEB/health"; echo; }
EOF
. /tmp/catraca-f03/aux.sh
git rev-parse HEAD
env | grep -c '^GATEWAY_'
if [ -e .env ]; then grep -vE '^[[:space:]]*(#|$)' .env | grep -cvE '^(CATRACA_PORT|COMPOSE_PROJECT_NAME)='; else echo "sem .env"; fi
curl -s -w '\n%{http_code}\n' "$WEB/health"
sql "SELECT to_regclass('public.payment_attempts') IS NOT NULL"
```

Esperado: o hash do commit; `0` (nenhuma variável `GATEWAY_*` no shell); `sem .env` ou `0` (o `.env` só tem `CATRACA_PORT`/`COMPOSE_PROJECT_NAME`); `{"status":"ok"}` e `200`; `t` (a tabela de tentativas existe). Sem isso, o contrato não é executável.

**Legenda das funções auxiliares:** `tentativa <pay>` imprime `origem|resultado|final do cartão|atraso sorteado em ms|tentativas de entrega|entregue|segundos entre solicitação e entrega`; `janela <pay> <a> <b>` imprime três booleanos: tempo entre solicitação e entrega em [a; b] s, entrega não antes do prazo gravado, atraso gravado em [a; b] s; `faixa <arquivo> <a> <b>` lê a linha de resultado do comando e imprime `<resultado> <segundos> dentro|fora`; `linha1 <arquivo> <final> <escala>` conta as linhas de solicitação no formato literal com retorno abaixo de 1 s; `entregas <pay>` conta as linhas de log `gateway: resultado entregue` daquela tentativa no container da aplicação.

## 2. Itens verificáveis

A tabela é o índice. Os comandos exatos e o resultado completo de cada item estão no roteiro 2.1, que prevalece sobre o resumo.

| ID | Item | Tipo | Como verificar (resumo) | Resultado esperado (resumo) | Regras |
|----|------|------|-------------------------|-----------------------------|--------|
| C01 | Cartão `…0001`: solicitação na hora, `aprovado` entre 2 e 5 s | TEMPO | `gateway:simular 4000000000000001` em segundo plano; conferir a linha 1 antes do resultado; banco e log | Linha 1 antes de qualquer resultado, retorno `0,x s`; `aprovado em X s` com 2 ≤ X ≤ 5; banco `t\|t\|t`; 1 entrega no log | Gateway (brief) |
| C02 | Cartão `…0002`: `recusado` entre 2 e 5 s | TEMPO | `gateway:simular 4000000000000002`; banco e log | `recusado em X s` com 2 ≤ X ≤ 5; banco `t\|t\|t`; 1 entrega | Gateway (brief) |
| C03 | Cartão `…0003`: pendente aos 29 s, `aprovado` entre 30 e 40 s | TEMPO | `gateway:simular 4000000000000003` em segundo plano; consulta aos 29 s; resultado final | Aos ≥ 29 s `t\|t` e nenhum resultado impresso; `aprovado em X s` com 30 ≤ X ≤ 40; banco `t\|t\|t`; 1 entrega | Gateway (brief) |
| C04 | Cartão `…0004`: `recusado` entre 30 e 40 s | TEMPO | `gateway:simular 4000000000000004`; banco e log | `recusado em X s` com 30 ≤ X ≤ 40; banco `t\|t\|t`; 1 entrega | Gateway (brief) |
| C05 | Outros finais: `recusado` entre 2 e 5 s | TEMPO | `gateway:simular` com `4000000000000009` e `5555555555554444` | Os dois `recusado` com 2 ≤ X ≤ 5; finais `0009` e `4444`; banco `t\|t\|t`; 1 entrega cada | Gateway (brief) |
| C06 | Reinício do `app` com tentativa `…0003` pendente: entrega única no prazo original | TEMPO | `--sem-esperar`; `docker compose restart app`; esperar 45 s da solicitação; banco e log | Reiniciado antes do prazo; entregue uma vez, em até 1 s depois do prazo gravado, 30–40 s após a solicitação; `delivery_attempts = 1`; 1 entrega no log | Gateway (brief); base de R08/R11 |
| C07 | `app` parado até o prazo vencer: entrega única em até 5 s depois de voltar | TEMPO | `--sem-esperar`; `docker compose stop app` até o prazo + 3 s; `docker compose start app`; banco e log | Pendente e sem tentativa durante a parada; depois, entregue uma vez, até 5 s após a volta; `delivery_attempts = 1`; 1 entrega no log | Gateway (brief); base de R08/R11 |
| C08 | Só os 4 últimos dígitos são gravados | DB | Cartão distinto `4000123456780002`; consultas SQL, restrição da coluna, `pg_dump` e logs | `card_last4 = 0002`; única coluna de cartão `card_last4`; 0 linhas com 16 dígitos; a coluna recusa `12345`; 0 ocorrências no dump e nos logs | — |
| C09 | Escala de atraso: ignorada fora do ambiente de testes, vale com `NODE_ENV=test` | CLI | `printenv`, `catraca config`, log do worker; `gateway:simular` com `-e GATEWAY_DELAY_SCALE=0.01` sem e com `-e NODE_ENV=test` | Padrão `GATEWAY_DELAY_SCALE=1`; sem `NODE_ENV=test` continua 1 e `…0001` leva 2–5 s; com `NODE_ENV=test` vale `0.01` e `…0003` leva 0,3–1,5 s | Modo padrão (brief) |
| C10 | Testes nomeados da escala de atraso | TEST | `npm run gates -- test/f03/escala-atraso.test.ts` | `exit=0`; `testes: ok (N executados, 0 falharam)` com N ≥ 3 e o filtro; `resultado: OK` | Modo padrão (brief) |
| C11 | CF02: ambiente do `npm run up` sem configuração de gateway opera no modo `simulado` com os tempos do brief | TEMPO | `.env`, shell, `docker compose config`, `printenv`, `catraca config`, logs de boot e do worker; `gateway:simular 4000000000000001` | Nenhuma variável de gateway em lugar algum; `GATEWAY_MODE=simulado`, escala 1; `aprovado em X s` com 2 ≤ X ≤ 5 | Gateway (brief); modo padrão |
| C12 | Entrada inválida no diagnóstico não grava nada | CLI | `gateway:simular` sem argumento, com 15, 17 e não dígitos, e com opção desconhecida | `exit=2` e a mensagem exata em cada caso; contagem de tentativas inalterada | Gateway (brief: 16 dígitos) |

### 2.1 Roteiro detalhado

Todos os comandos rodam a partir da raiz do repositório (o `aux.sh` faz o `cd`).

#### C01 — Cartão `…0001`: solicitação na hora, `aprovado` entre 2 e 5 s

```bash
. /tmp/catraca-f03/aux.sh
simular 4000000000000001 < /dev/null > "$S/c01.txt" &
CLI=$!
esperar_linha1 "$S/c01.txt"
grep -cE '^(aprovado|recusado) ' "$S/c01.txt"
wait "$CLI"; echo "exit=$?"
cat "$S/c01.txt"
linha1 "$S/c01.txt" 0001 1
faixa "$S/c01.txt" 2 5
PAY=$(pay_de "$S/c01.txt"); echo "$PAY"
tentativa "$PAY"
janela "$PAY" 2 5
entregas "$PAY"
```

Esperado:
- `esperar_linha1` termina sem mensagem; o `grep -cE` seguinte imprime `0` (a linha da solicitação foi impressa antes de existir resultado).
- `exit=0`.
- O arquivo tem exatamente 2 linhas: `solicitação pay_<16 caracteres> registrada em 0,<d> s (cartão final 0001, modo simulado, escala 1)` e `aprovado em <X> s`.
- `linha1` imprime `1` (formato literal e retorno abaixo de 1 s).
- `faixa` imprime `aprovado <X> dentro`.
- `tentativa` imprime `diagnostico|aprovado|0001|<D>|1|t|<s>`; `<s>` arredondado a uma casa é o `<X>` da linha de resultado.
- `janela` imprime `t|t|t`.
- `entregas` imprime `1` (o worker do processo da aplicação entregou a tentativa, uma vez).

#### C02 — Cartão `…0002`: `recusado` entre 2 e 5 s

```bash
. /tmp/catraca-f03/aux.sh
simular 4000000000000002 < /dev/null > "$S/c02.txt"; echo "exit=$?"
cat "$S/c02.txt"
linha1 "$S/c02.txt" 0002 1
faixa "$S/c02.txt" 2 5
PAY=$(pay_de "$S/c02.txt"); echo "$PAY"
tentativa "$PAY"
janela "$PAY" 2 5
entregas "$PAY"
```

Esperado: `exit=0`; 2 linhas (solicitação com `cartão final 0002` e `recusado em <X> s`); `1`; `recusado <X> dentro`; `diagnostico|recusado|0002|<D>|1|t|<s>`; `t|t|t`; `1`.

#### C03 — Cartão `…0003`: pendente aos 29 s, `aprovado` entre 30 e 40 s

```bash
. /tmp/catraca-f03/aux.sh
simular 4000000000000003 < /dev/null > "$S/c03.txt" &
CLI=$!
esperar_linha1 "$S/c03.txt"
PAY=$(pay_de "$S/c03.txt"); echo "$PAY"
sleep 29.2
sql "SELECT delivered_at IS NULL, clock_timestamp() - requested_at >= interval '29 seconds' FROM payment_attempts WHERE id = '$PAY'"
grep -cE '^(aprovado|recusado) ' "$S/c03.txt"
wait "$CLI"; echo "exit=$?"
cat "$S/c03.txt"
linha1 "$S/c03.txt" 0003 1
faixa "$S/c03.txt" 30 40
tentativa "$PAY"
janela "$PAY" 30 40
entregas "$PAY"
```

Esperado:
- A consulta depois do `sleep` imprime `t|t` (já se passaram pelo menos 29 s da solicitação e não há resultado); o `grep -cE` imprime `0`.
- `exit=0`; 2 linhas (solicitação com `cartão final 0003` e `aprovado em <X> s`).
- `1`; `aprovado <X> dentro`; `diagnostico|aprovado|0003|<D>|1|t|<s>`; `t|t|t`; `1`.

#### C04 — Cartão `…0004`: `recusado` entre 30 e 40 s

```bash
. /tmp/catraca-f03/aux.sh
simular 4000000000000004 < /dev/null > "$S/c04.txt"; echo "exit=$?"
cat "$S/c04.txt"
linha1 "$S/c04.txt" 0004 1
faixa "$S/c04.txt" 30 40
PAY=$(pay_de "$S/c04.txt"); echo "$PAY"
tentativa "$PAY"
janela "$PAY" 30 40
entregas "$PAY"
```

Esperado: `exit=0`; 2 linhas (solicitação com `cartão final 0004` e `recusado em <X> s`); `1`; `recusado <X> dentro`; `diagnostico|recusado|0004|<D>|1|t|<s>`; `t|t|t`; `1`.

#### C05 — Outros finais: `recusado` entre 2 e 5 s

```bash
. /tmp/catraca-f03/aux.sh
for CARTAO in 4000000000000009 5555555555554444; do
  simular "$CARTAO" < /dev/null > "$S/c05-$CARTAO.txt"; echo "exit=$?"
  cat "$S/c05-$CARTAO.txt"
  faixa "$S/c05-$CARTAO.txt" 2 5
  PAY=$(pay_de "$S/c05-$CARTAO.txt"); echo "$PAY"
  tentativa "$PAY"
  janela "$PAY" 2 5
  entregas "$PAY"
done
```

Esperado, para cada cartão: `exit=0`; 2 linhas (solicitação com `cartão final 0009` e, no segundo, `cartão final 4444`; depois `recusado em <X> s`); `recusado <X> dentro`; `diagnostico|recusado|0009|<D>|1|t|<s>` e `diagnostico|recusado|4444|<D>|1|t|<s>`; `t|t|t`; `1`.

#### C06 — Reinício do `app` com tentativa pendente: entrega única no prazo original

```bash
. /tmp/catraca-f03/aux.sh
simular 4000000000000003 --sem-esperar < /dev/null > "$S/c06.txt"; echo "exit=$?"
cat "$S/c06.txt"
linha1 "$S/c06.txt" 0003 1
PAY=$(pay_de "$S/c06.txt"); echo "$PAY"
ANTES=$(docker inspect -f '{{.State.StartedAt}}' "$(docker compose ps -q app)")
docker compose restart app
saude
DEPOIS=$(docker inspect -f '{{.State.StartedAt}}' "$(docker compose ps -q app)")
[ "$ANTES" != "$DEPOIS" ] && echo "reiniciado"
sql "SELECT delivered_at IS NULL, clock_timestamp() < due_at FROM payment_attempts WHERE id = '$PAY'"
until [ "$(sql "SELECT clock_timestamp() - requested_at >= interval '45 seconds' FROM payment_attempts WHERE id = '$PAY'")" = t ]; do sleep 1; done
tentativa "$PAY"
janela "$PAY" 30 40
sql "SELECT delivered_at <= due_at + interval '1 second' FROM payment_attempts WHERE id = '$PAY'"
entregas "$PAY"
```

Esperado:
- `exit=0`; o arquivo tem só a linha da solicitação (`--sem-esperar`); `linha1` imprime `1`.
- `saude` imprime `{"status":"ok"}`; `reiniciado`.
- `t|t` (a aplicação voltou com a tentativa ainda pendente e antes do prazo gravado).
- Depois de 45 s da solicitação: `diagnostico|aprovado|0003|<D>|1|t|<s>`; `t|t|t`; `t` (entregue no prazo original, no máximo 1 s depois dele); `entregas` imprime `1` (o log do container inclui as duas execuções do processo).

#### C07 — `app` parado até o prazo vencer: entrega única em até 5 s depois de voltar

```bash
. /tmp/catraca-f03/aux.sh
simular 4000000000000003 --sem-esperar < /dev/null > "$S/c07.txt"; echo "exit=$?"
PAY=$(pay_de "$S/c07.txt"); echo "$PAY"
docker compose stop app
until [ "$(sql "SELECT clock_timestamp() > due_at + interval '3 seconds' FROM payment_attempts WHERE id = '$PAY'")" = t ]; do sleep 1; done
sql "SELECT delivered_at IS NULL, delivery_attempts FROM payment_attempts WHERE id = '$PAY'"
docker compose start app
saude
VOLTA=$(sql "SELECT clock_timestamp()"); echo "$VOLTA"
sleep 6
tentativa "$PAY"
sql "SELECT delivered_at > due_at + interval '3 seconds', delivered_at <= '$VOLTA'::timestamptz + interval '5 seconds' FROM payment_attempts WHERE id = '$PAY'"
entregas "$PAY"
docker compose ps --status running --services | grep -cx app
```

Esperado:
- `exit=0`; o id `pay_…`.
- Com a aplicação parada e o prazo vencido há 3 s: `t|0` (pendente, nenhuma tentativa de entrega).
- `saude` imprime `{"status":"ok"}`; o instante da volta (relógio do banco).
- `diagnostico|aprovado|0003|<D>|1|t|<s>` (com `<s>` maior que `<D>`/1000 + 3: a entrega aconteceu depois da parada).
- `t|t` (entregue depois do prazo vencido e no máximo 5 s depois de a aplicação voltar).
- `entregas` imprime `1`; a última linha imprime `1` (o `app` está rodando de novo).

#### C08 — Só os 4 últimos dígitos são gravados

```bash
. /tmp/catraca-f03/aux.sh
simular 4000123456780002 < /dev/null > "$S/c08.txt"; echo "exit=$?"
cat "$S/c08.txt"
grep -c '4000123456780002' "$S/c08.txt"
PAY=$(pay_de "$S/c08.txt"); echo "$PAY"
sql "SELECT card_last4 FROM payment_attempts WHERE id = '$PAY'"
sql "SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_attempts' AND column_name ~ '(card|cartao|pan|number|numero|digit)'"
sql "SELECT count(*) > 0, count(*) FILTER (WHERE t::text ~ '[0-9]{16}' OR t::text LIKE '%400012345678%') FROM payment_attempts t"
sql "UPDATE payment_attempts SET card_last4 = '12345' WHERE id = '$PAY'" 2>&1; echo "exit=$?"
sql "SELECT card_last4 FROM payment_attempts WHERE id = '$PAY'"
docker compose exec -T db pg_dump -U catraca -d catraca --data-only | grep -c '400012345678'
docker compose logs --no-log-prefix app | grep -c '400012345678'
```

Esperado:
- `exit=0`; 2 linhas (solicitação com `cartão final 0002` e `recusado em <X> s`); `0` (o comando não imprime o número completo).
- `0002`; `card_last4` (única coluna relativa a cartão).
- `t|0` (nenhuma tentativa gravada — destas e dos itens anteriores — contém 16 dígitos seguidos nem o número usado aqui).
- O `UPDATE` imprime uma linha `ERROR:` com `violates check constraint` e `exit=` diferente de `0` (a coluna recusa o que não for exatamente 4 dígitos); a consulta seguinte continua `0002`.
- `0` no dump completo do banco e `0` nos logs da aplicação.

#### C09 — Escala de atraso: ignorada fora do ambiente de testes, vale com `NODE_ENV=test`

```bash
. /tmp/catraca-f03/aux.sh
docker compose exec -T app printenv GATEWAY_DELAY_SCALE; echo "printenv_exit=$?"
docker compose exec -T app catraca config | grep -E '^(NODE_ENV|GATEWAY_MODE|GATEWAY_DELAY_SCALE)='
docker compose logs --no-log-prefix app | grep -F '"msg":"gateway: worker iniciado"' | tail -n 1 > "$S/c09-worker.txt"; cat "$S/c09-worker.txt"
grep -cF '"modo":"simulado"' "$S/c09-worker.txt"; grep -cE '"escala":1[,}]' "$S/c09-worker.txt"
# (a) escala definida fora do ambiente de testes
docker compose exec -T -e GATEWAY_DELAY_SCALE=0.01 app catraca config | grep -E '^(NODE_ENV|GATEWAY_DELAY_SCALE)='
docker compose exec -T -e GATEWAY_DELAY_SCALE=0.01 app catraca gateway:simular 4000000000000001 < /dev/null > "$S/c09a.txt"; echo "exit=$?"
cat "$S/c09a.txt"; linha1 "$S/c09a.txt" 0001 1; faixa "$S/c09a.txt" 2 5
janela "$(pay_de "$S/c09a.txt")" 2 5
# (b) escala definida no ambiente de testes
docker compose exec -T -e NODE_ENV=test -e GATEWAY_DELAY_SCALE=0.01 app catraca config | grep -E '^(NODE_ENV|GATEWAY_DELAY_SCALE)='
docker compose exec -T -e NODE_ENV=test -e GATEWAY_DELAY_SCALE=0.01 app catraca gateway:simular 4000000000000003 < /dev/null > "$S/c09b.txt"; echo "exit=$?"
cat "$S/c09b.txt"; linha1 "$S/c09b.txt" 0003 0.01; faixa "$S/c09b.txt" 0.3 1.5
sql "SELECT delay_ms BETWEEN 300 AND 400, EXTRACT(EPOCH FROM delivered_at - requested_at) BETWEEN 0.3 AND 1.5 FROM payment_attempts WHERE id = '$(pay_de "$S/c09b.txt")'"
```

Esperado:
- Padrão: `printenv_exit=1` (nenhuma escala no ambiente do container); as linhas `NODE_ENV=production`, `GATEWAY_MODE=simulado` e `GATEWAY_DELAY_SCALE=1`; a última linha `gateway: worker iniciado` do log da aplicação, seguida de `1` e `1` (o worker do processo da aplicação roda com `"modo":"simulado"` e `"escala":1`).
- (a) Sem `NODE_ENV=test`: `NODE_ENV=production` e `GATEWAY_DELAY_SCALE=1` (a variável é ignorada; um aviso em stderr é aceitável); `exit=0`; solicitação com `escala 1`; `linha1` → `1`; `aprovado <X> dentro` (2 a 5 s); `t|t|t`.
- (b) Com `NODE_ENV=test`: `NODE_ENV=test` e `GATEWAY_DELAY_SCALE=0.01`; `exit=0`; solicitação com `escala 0.01`; `linha1` → `1`; `aprovado <X> dentro` (0,3 a 1,5 s, isto é, 30–40 s × 0,01 mais a varredura); `t|t`.

#### C10 — Testes nomeados da escala de atraso

```bash
. /tmp/catraca-f03/aux.sh
grep -c 'F03-CA08' app/test/f03/escala-atraso.test.ts
npm run gates -- test/f03/escala-atraso.test.ts > "$S/c10.txt" 2>&1; echo "exit=$?"
grep -E '^\[gates\] ' "$S/c10.txt"
```

Esperado:
- O `grep -c` imprime um número ≥ 3 (os testes do arquivo levam o ID do critério no nome).
- `exit=0`.
- As linhas `[gates] lint: ok`, `[gates] typecheck: ok`, `[gates] testes: ok (N executados, 0 falharam) [filtro: test/f03/escala-atraso.test.ts]` com `N` ≥ 3 e `[gates] resultado: OK` (precedidas pela linha do projeto Compose de gates).

#### C11 — CF02: ambiente do `npm run up` sem configuração de gateway opera no modo `simulado` com os tempos do brief

```bash
. /tmp/catraca-f03/aux.sh
if [ -e .env ]; then echo "tem .env"; grep -cE '^[[:space:]]*(export[[:space:]]+)?GATEWAY_' .env; else echo "sem .env"; fi
env | grep -c '^GATEWAY_'
docker compose config | grep -c 'GATEWAY_'
docker compose exec -T app printenv GATEWAY_MODE; echo "printenv_exit=$?"
docker compose exec -T app catraca config | grep -E '^GATEWAY_(MODE|DELAY_SCALE)='
docker compose logs --no-log-prefix app | grep -F '[catraca] no ar na porta' | tail -n 1
docker compose logs --no-log-prefix app | grep -F '"msg":"gateway: worker iniciado"' | tail -n 1 > "$S/c11-worker.txt"
grep -cF '"modo":"simulado"' "$S/c11-worker.txt"; grep -cE '"escala":1[,}]' "$S/c11-worker.txt"
simular 4000000000000001 < /dev/null > "$S/c11.txt"; echo "exit=$?"
cat "$S/c11.txt"; linha1 "$S/c11.txt" 0001 1; faixa "$S/c11.txt" 2 5
PAY=$(pay_de "$S/c11.txt"); tentativa "$PAY"; janela "$PAY" 2 5; entregas "$PAY"
```

Esperado:
- `sem .env`, ou `tem .env` seguido de `0` (nenhuma variável de gateway no `.env`); `0` (nenhuma no shell); `0` (a configuração do Compose não passa nenhuma variável de gateway ao container); `printenv_exit=1`.
- `GATEWAY_MODE=simulado` e `GATEWAY_DELAY_SCALE=1` (valores padrão da configuração da F01).
- A linha de boot `[catraca] no ar na porta 3000 (gateway: simulado, fuso: America/Sao_Paulo)`; `1` e `1` (worker com `"modo":"simulado"` e `"escala":1`).
- `exit=0`; 2 linhas (solicitação com `cartão final 0001, modo simulado, escala 1` e `aprovado em <X> s`); `1`; `aprovado <X> dentro`; `diagnostico|aprovado|0001|<D>|1|t|<s>`; `t|t|t`; `1`.

#### C12 — Entrada inválida no diagnóstico não grava nada

```bash
. /tmp/catraca-f03/aux.sh
echo "antes=$(sql "SELECT count(*) FROM payment_attempts")"
simular < /dev/null 2>&1; echo "exit=$?"
simular 400000000000001 < /dev/null 2>&1; echo "exit=$?"
simular 40000000000000011 < /dev/null 2>&1; echo "exit=$?"
simular 4000a00000000001 < /dev/null 2>&1; echo "exit=$?"
simular 4000000000000001 --rapido < /dev/null 2>&1; echo "exit=$?"
echo "depois=$(sql "SELECT count(*) FROM payment_attempts")"
```

Esperado:
- Sem argumento: `Uso: catraca gateway:simular <número do cartão com 16 dígitos> [--sem-esperar]` e `exit=2`.
- 15 dígitos, 17 dígitos e com letra: cada um imprime `Número de cartão inválido: informe exatamente 16 dígitos (ex.: 4000000000000001).` e `exit=2`.
- Opção desconhecida: a linha `Uso: …` acima e `exit=2`.
- `depois=` igual a `antes=` (nenhuma tentativa gravada).

### Encerramento (depois do C12)

```bash
rm -rf /tmp/catraca-f03
```

O encerramento não tem veredito. Em seguida o avaliador roda os gates completos (G1) e o `npm run down`, conforme a skill `evaluate-feature`.

## 3. Mapeamento critério → itens

| Critério (PRD) | Itens |
|----------------|-------|
| F03-CA01 | C01, C12 |
| F03-CA02 | C02 |
| F03-CA03 | C03 |
| F03-CA04 | C04 |
| F03-CA05 | C05 |
| F03-CA06 | C06, C07 |
| F03-CA07 | C08, C12 |
| F03-CA08 | C09, C10 |
| CF02 (F01 → F03) | C11 |

C12 verifica o tratamento de entrada do comando de diagnóstico citado no F03-CA01 (o `gateway:simular`) e que uma entrada inválida não deixa nenhum registro (F03-CA07). C01–C05 e C11 rodam no modo padrão, sem nenhuma variável de ambiente de gateway, e por isso também sustentam a primeira metade do F03-CA08; o C09 e o C10 verificam a segunda metade (a escala só vale no ambiente de testes).

## 4. Fora deste contrato

- **CF04 (F03 → F05)** — o resultado do gateway chegando ao ingresso (`declined` entre 2 e 5 s com `…0002`, `pending` aos 29 s e `confirmed` até 40 s com `…0003`): pertence ao contrato da F05, a consumidora.
- Entrega ao tratador de compras (origem `compra`), tentativa de compra pendente sem tratador e reentrega após erro do tratador: não têm superfície em execução antes da F05; estão nos testes `app/test/f03/worker.test.ts` e `app/test/f03/retomada.test.ts` (inclusive dois workers concorrentes entregando cada tentativa uma única vez), executados pelos gates completos da avaliação (G1), e em execução nos contratos da F05 (F05-CA01, F05-CA02, F05-CA08, CF04, CF06).
- Validação de 16 dígitos na compra (`invalid_request`): F05, F06 e F07.
- Resposta do gateway depois do cancelamento não mudar o ingresso (R11): F05 (F05-CA08, CF06) e F07 (CF13).
- Tempos observados pelo status do ingresso na vitrine e na API: F05-CA01, F05-CA02, F06-CA02, F07-CA10 e F07-CA11.
- Configuração padrão da F01 (`catraca config` com 10 linhas, ausência de chaves de pagamento): contrato da F01 (C05); aqui só o que afeta o gateway.
- Gateway real e outros modos: fora de escopo (o `GATEWAY_MODE` só aceita `simulado`).

## 5. Alterações do contrato

Nenhuma.
