# Contrato: F01 — Fundação e harness

## 1. Pré-requisitos de ambiente

- **Commit avaliado:** o avaliador registra o hash no relatório (`git rev-parse HEAD` na pasta do repositório avaliado — `main`, branch ou worktree da F01).
- **Onde roda:** este contrato roda inteiro num **clone limpo** em `/tmp/catraca-eval-<timestamp>` (variável `$EVAL`), no Linux ou no WSL. O down/up inicial da skill `evaluate-feature` é feito pelos próprios itens C01 e C09; não suba o ambiente na pasta original.
- **Subir:** `npm run up` · **Derrubar:** `npm run down` · **Gates:** `npm run gates` (todos na raiz de `$EVAL`; nenhum `npm install`).
- **Endereços:** `$WEB` = `$API` = `http://localhost:3000`. **Chave de parceiro:** `parceiro-catraca-dev` (documentada no README; não é usada neste contrato — a API de parceiros é da F07).
- **Contas da seed:** organizador A (`organizador.a@catraca.test`), organizador B (`organizador.b@catraca.test`), participante (`participante@catraca.test`); senha no README. Este contrato confere as contas no banco; o login é da F02 (CF01).
- **Modo:** padrão — nenhuma variável de ambiente definida e nenhum arquivo `.env`.
- **Ferramentas do avaliador:** `bash`, `git`, `curl`, `docker` com Compose v2, `node` (LTS). Nenhuma outra.
- **Ordem:** os itens rodam na ordem numérica, na mesma sessão de shell (as variáveis `REPO`, `COMMIT` e `EVAL` da Preparação são usadas por todos). Itens que dependem do estado de itens anteriores declaram `Depende de`.
- **Tempo:** a primeira subida baixa imagens e constrói a aplicação (alguns minutos); os gates constroem a própria imagem a cada execução (com cache).
- **Arquivos auxiliares:** as saídas guardadas pelos itens ficam em `/tmp/catraca-eval-<timestamp>-*` (fora do clone), para que `git status` do clone continue limpo.

### Preparação (antes do C01)

```bash
# na pasta do repositório avaliado
REPO=$(git rev-parse --show-toplevel)
COMMIT=$(git rev-parse HEAD)
EVAL=/tmp/catraca-eval-$(date +%Y%m%d%H%M%S)
unset CATRACA_PORT COMPOSE_PROJECT_NAME
echo "REPO=$REPO COMMIT=$COMMIT EVAL=$EVAL"

# nada do projeto Compose "catraca" pode existir antes do C01, e a porta 3000 precisa estar livre
docker ps -a --filter label=com.docker.compose.project=catraca --format '{{.Names}}'
docker volume ls --filter label=com.docker.compose.project=catraca --format '{{.Name}}'
curl -s -o /dev/null -w '%{http_code}\n' --max-time 3 http://localhost:3000/; echo "curl_exit=$?"
```

Esperado: as duas listagens do Docker vazias; o `curl` imprime `000` e `curl_exit=7`. Se houver container ou volume do projeto `catraca` (de outro clone ou worktree), rode `npm run down` na pasta que o criou e `docker volume rm catraca_db-data` (dados de desenvolvimento descartáveis — a seed recria as contas). Se outra coisa ocupar a porta 3000, libere-a. Sem isso, o contrato não é executável.

## 2. Itens verificáveis

A tabela é o índice. Os comandos exatos e o resultado completo de cada item estão no roteiro 2.1, que prevalece sobre o resumo.

| ID | Item | Tipo | Como verificar (resumo) | Resultado esperado (resumo) | Regras |
|----|------|------|-------------------------|-----------------------------|--------|
| C01 | Subida em clone limpo, sem outro passo | CLI | `git clone` + `git checkout` do commit + `npm run up` | Clone sem `.env` e sem `node_modules`; `exit=0`; linhas `[up] Catraca no ar.`, `[up] $WEB = http://localhost:3000`, `[up] $API = http://localhost:3000` | — (harness) |
| C02 | Health com banco | HTTP | `curl` em `/health` | `{"status":"ok"}`; `200 application/json; charset=utf-8` | — |
| C03 | Exatamente as 3 contas da seed | DB | `psql` no serviço `db` + log da seed | 3 linhas exatas (e-mail, papel, nome, id `usr_…`, hash scrypt sem a senha); `count = 3`; log `criadas 3, já existiam 0` | — |
| C04 | Página inicial no ar | HTTP | `curl` em `/` | `200 text/html; charset=utf-8`; layout `pt-BR` com navegação e vitrine vazia | — |
| C05 | Sobe sem `.env`, sem chave de pagamento, gateway `simulado` | CLI | `.env` ausente, `printenv`, `catraca config`, `env` do container | `sem .env`; `GATEWAY_MODE` ausente do ambiente; `catraca config` com `GATEWAY_MODE=simulado` e `GATEWAY_DELAY_SCALE=1`; nenhuma variável de pagamento | — |
| C06 | Gates verdes com o ambiente no ar | TEST | `npm run gates` com o `up` rodando | `exit=0`; lint ok, typecheck ok, testes ok com N ≥ 1 executados e 0 falhas; `resultado: OK`; projeto `catraca-gates` | — |
| C07 | Ambiente do `up` intacto após os gates | HTTP | Depende de C06. `curl /health`, `StartedAt` do `app`, recursos do projeto de gates | `200 {"status":"ok"}`; mesmo container; nenhum container/volume `catraca-gates` | — |
| C08 | Gates vermelhos com teste quebrado de propósito | TEST | Arquivo de teste temporário não versionado que falha; `npm run gates`; remover o arquivo | `exit` ≠ 0; `testes: falhou (N executados, 1 falharam)`; `resultado: FALHOU`; clone limpo de novo | — |
| C09 | Derrubar encerra tudo | CLI | `npm run down`; `curl`; `docker ps`; volume | `exit=0`; `000` + `curl_exit=7`; nenhum container do projeto; nada em `:3000->`; volume `catraca_db-data` preservado | — |
| C10 | Derrubar sem nada no ar | CLI | Depende de C09. `npm run down` de novo | `exit=0` e `[down] Pronto: …` | — |
| C11 | Porta ocupada | CLI | Depende de C09. Ocupar a 3000 com `node`; `npm run up` | `exit` ≠ 0; `[up] Porta 3000 em uso.` com `CATRACA_PORT`; nenhum container criado | — |
| C12 | Docker indisponível | CLI | `DOCKER_HOST` para socket inexistente; `npm run up` e `npm run gates` | `exit` ≠ 0 nos dois; `Docker não está disponível` nos dois | — |
| C13 | Subir de novo: seed sem erro e sem duplicar | CLI | Depende de C03 e C09. `npm run up`; log; `psql` | `exit=0`; health ok; `migrations: aplicadas 0`; `seed: … (criadas 0, já existiam 3)`; mesmos ids; `count = 3` | — |
| C14 | Migrations e seed reexecutadas sem duplicar | CLI | Depende de C13. `catraca migrate`, `catraca seed` (2×); `psql` | `exit=0` em todos; `aplicadas 0`; `criadas 0, já existiam 3`; uma conta por e-mail | — |
| C15 | Falha de migration impede a subida e mostra o erro | CLI | Depende de C13. Migration temporária com erro; `npm run up`; remover; `npm run up` | 1º `exit` ≠ 0 com `[up] Falha ao subir a Catraca` e `falha na etapa migrations: … division by zero`; nada aplicado; 2º `exit=0` e health ok | — |
| C16 | `AGENTS.md`, `CLAUDE.md` e README | CLI | `grep` dos itens obrigatórios | Nenhum `FALTA`; `@AGENTS.md` no `CLAUDE.md`; `0` menções a "criado pela F01" | — |

### 2.1 Roteiro detalhado

Todos os comandos rodam em `$EVAL` (depois do `cd` do C01), salvo indicação.

#### C01 — Subida em clone limpo, sem outro passo

```bash
git clone --quiet "$REPO" "$EVAL"
cd "$EVAL"
git checkout --quiet --detach "$COMMIT"
git status --porcelain | wc -l
test -e .env && echo "tem .env" || echo "sem .env"
test -e node_modules && echo "tem node_modules" || echo "sem node_modules"
npm run up; echo "exit=$?"
```

Esperado:
- `0` (árvore limpa), `sem .env`, `sem node_modules`.
- Entre o `git checkout` e o `npm run up` não há nenhum outro comando (nenhum `npm install`, nenhuma cópia de arquivo).
- A saída do `npm run up` termina com estas linhas, nesta ordem, seguidas de `exit=0`:
  ```
  [up] Catraca no ar.
  [up] $WEB = http://localhost:3000
  [up] $API = http://localhost:3000
  [up] Contas da seed e chave de parceiro: README.md, seção "Credenciais".
  ```

#### C02 — Health com banco

```bash
curl -s -w '\n%{http_code} %{content_type}\n' http://localhost:3000/health
```

Esperado: exatamente duas linhas — `{"status":"ok"}` e `200 application/json; charset=utf-8`.

#### C03 — Exatamente as 3 contas da seed

```bash
docker compose exec -T db psql -U catraca -d catraca -At -c "SELECT email, role, name, id ~ '^usr_[a-z0-9]{16}\$', password_hash LIKE 'scrypt%', position('catraca123' in password_hash) = 0 FROM users ORDER BY email"
docker compose exec -T db psql -U catraca -d catraca -At -c "SELECT count(*) FROM users"
docker compose exec -T db psql -U catraca -d catraca -At -c "SELECT id, email FROM users ORDER BY email" > "$EVAL-ids-1.txt"; cat "$EVAL-ids-1.txt"
docker compose logs --no-log-prefix app | grep -F '[catraca] seed:'
```

Esperado:
- Primeira consulta, exatamente:
  ```
  organizador.a@catraca.test|organizador|Organizador A|t|t|t
  organizador.b@catraca.test|organizador|Organizador B|t|t|t
  participante@catraca.test|participante|Participante|t|t|t
  ```
- Segunda consulta: `3`.
- Arquivo de ids: 3 linhas `usr_…|<e-mail>` (guardado para o C13).
- Log: exatamente uma linha `[catraca] seed: contas garantidas 3 (criadas 3, já existiam 0)`.

#### C04 — Página inicial no ar

```bash
curl -s -w '\n%{http_code} %{content_type}\n' http://localhost:3000/ > "$EVAL-home.html"; tail -n 1 "$EVAL-home.html"
for s in '<html lang="pt-BR">' '<nav' 'data-area="navegacao"' 'Eventos à venda' 'Nenhum evento à venda no momento.'; do grep -qF -- "$s" "$EVAL-home.html" && echo "ok: $s" || echo "FALTA: $s"; done
```

Esperado: `200 text/html; charset=utf-8`; cinco linhas `ok: …` e nenhuma `FALTA`.

#### C05 — Sobe sem `.env`, sem chave de pagamento, gateway `simulado`

```bash
test -e .env && echo "tem .env" || echo "sem .env"
git ls-files | grep -cE '(^|/)\.env$'
docker compose exec -T app printenv GATEWAY_MODE; echo "printenv_exit=$?"
docker compose exec -T app catraca config
docker compose exec -T app env | cut -d= -f1 | grep -ciE 'payment|pagamento|stripe|pagar|mercadopago|gateway_(api_)?(key|secret|token)'
```

Esperado:
- `sem .env`; `0` (nenhum `.env` versionado).
- `printenv` não imprime valor e `printenv_exit=1` (o modo não vem do ambiente; vem do padrão da aplicação).
- `catraca config` imprime 10 linhas `CHAVE=valor`, entre elas exatamente `NODE_ENV=production`, `TZ=America/Sao_Paulo`, `GATEWAY_MODE=simulado`, `GATEWAY_DELAY_SCALE=1`, `PARTNER_API_KEY=parceiro-catraca-dev` e `SESSION_SECRET=****`; nenhuma chave de pagamento entre as chaves listadas.
- Último comando imprime `0`.

#### C06 — Gates verdes com o ambiente no ar

```bash
docker inspect -f '{{.State.StartedAt}}' "$(docker compose ps -q app)" > "$EVAL-app-inicio.txt"; cat "$EVAL-app-inicio.txt"
npm run gates > "$EVAL-gates-verde.txt" 2>&1; echo "exit=$?"
grep -E '^\[gates\] ' "$EVAL-gates-verde.txt"
```

Esperado:
- `exit=0`.
- O `grep` mostra, nesta ordem, as linhas:
  ```
  [gates] projeto Compose "catraca-gates" (banco próprio, sem portas no host)
  [gates] lint: ok
  [gates] typecheck: ok
  [gates] testes: ok (N executados, 0 falharam)
  [gates] resultado: OK
  ```
  com `N` inteiro ≥ 1 (registrar o valor no relatório).

#### C07 — Ambiente do `up` intacto após os gates

Depende de: C06.

```bash
curl -s -w '\n%{http_code}\n' http://localhost:3000/health
docker inspect -f '{{.State.StartedAt}}' "$(docker compose ps -q app)" | diff - "$EVAL-app-inicio.txt" && echo "mesmo container"
docker ps -a --filter label=com.docker.compose.project=catraca-gates --format '{{.Names}}'
docker volume ls --filter label=com.docker.compose.project=catraca-gates --format '{{.Name}}'
```

Esperado: `{"status":"ok"}` e `200`; `mesmo container`; as duas listagens do Docker vazias.

#### C08 — Gates vermelhos com teste quebrado de propósito

O teste quebrado é um arquivo **temporário, não versionado**, removido no fim do item; nenhum arquivo versionado é editado.

```bash
cat > app/test/falha-proposital.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';

describe('falha proposital do contrato F01', () => {
  it('falha de propósito', () => {
    expect(1 + 1).toBe(3);
  });
});
EOF
npm run gates > "$EVAL-gates-vermelho.txt" 2>&1; echo "exit=$?"
grep -E '^\[gates\] ' "$EVAL-gates-vermelho.txt"
rm app/test/falha-proposital.test.ts
git status --porcelain | wc -l
```

Esperado:
- `exit=` com valor diferente de `0`.
- O `grep` mostra `[gates] lint: ok`, `[gates] typecheck: ok`, `[gates] testes: falhou (N executados, 1 falharam)` com `N` ≥ 2 e `[gates] resultado: FALHOU`.
- Depois do `rm`, `0` (clone limpo de novo).

#### C09 — Derrubar encerra tudo

```bash
npm run down; echo "exit=$?"
curl -s -o /dev/null -w '%{http_code}\n' --max-time 5 http://localhost:3000/health; echo "curl_exit=$?"
docker ps --filter label=com.docker.compose.project=catraca --format '{{.Names}}'
docker ps --format '{{.Names}} {{.Ports}}' | grep -F ':3000->'
docker volume ls --filter label=com.docker.compose.project=catraca --format '{{.Name}}'
```

Esperado:
- Última linha do `npm run down`: `[down] Pronto: containers e rede removidos; volume do banco preservado.`; `exit=0`.
- `000` e `curl_exit=7` (conexão recusada).
- As duas listagens de `docker ps` vazias (nenhum container do projeto; nenhuma porta 3000 publicada).
- Volume: `catraca_db-data` (preservado para o C13).

#### C10 — Derrubar sem nada no ar

Depende de: C09.

```bash
npm run down; echo "exit=$?"
docker ps -a --filter label=com.docker.compose.project=catraca --format '{{.Names}}'
```

Esperado: `[down] Pronto: containers e rede removidos; volume do banco preservado.`; `exit=0`; listagem vazia.

#### C11 — Porta ocupada

Depende de: C09 (ambiente derrubado).

```bash
node -e "require('node:net').createServer().listen(3000, '0.0.0.0', () => console.log('porta 3000 ocupada'))" &
OCUPANTE=$!
sleep 1
npm run up > "$EVAL-up-porta.txt" 2>&1; echo "exit=$?"
grep -F '[up]' "$EVAL-up-porta.txt"
kill "$OCUPANTE"
docker ps -a --filter label=com.docker.compose.project=catraca --format '{{.Names}}'
```

Esperado:
- `porta 3000 ocupada`; `exit=` diferente de `0`.
- Uma das linhas `[up]` é exatamente: `[up] Porta 3000 em uso. Libere a porta ou escolha outra com a variável CATRACA_PORT (ex.: CATRACA_PORT=3001 npm run up, ou CATRACA_PORT=3001 no arquivo .env).`
- A listagem do Docker vazia (nenhum container criado).

#### C12 — Docker indisponível

```bash
DOCKER_HOST=unix:///tmp/catraca-docker-inexistente.sock npm run up > "$EVAL-up-sem-docker.txt" 2>&1; echo "exit_up=$?"
grep -F 'Docker não está disponível' "$EVAL-up-sem-docker.txt"
DOCKER_HOST=unix:///tmp/catraca-docker-inexistente.sock npm run gates > "$EVAL-gates-sem-docker.txt" 2>&1; echo "exit_gates=$?"
grep -F 'Docker não está disponível' "$EVAL-gates-sem-docker.txt"
docker ps -a --filter label=com.docker.compose.project=catraca --format '{{.Names}}'
```

Esperado: `exit_up` e `exit_gates` diferentes de `0`; cada `grep` mostra uma linha começando com `[up] Docker não está disponível` e `[gates] Docker não está disponível`, respectivamente; listagem do Docker (real) vazia.

#### C13 — Subir de novo: seed sem erro e sem duplicar

Depende de: C03 (arquivo de ids) e C09 (volume preservado).

```bash
npm run up; echo "exit=$?"
curl -s -w '\n%{http_code}\n' http://localhost:3000/health
docker compose logs --no-log-prefix app | grep -E '^\[catraca\] (migrations|seed):'
docker compose exec -T db psql -U catraca -d catraca -At -c "SELECT id, email FROM users ORDER BY email" > "$EVAL-ids-2.txt"
diff "$EVAL-ids-1.txt" "$EVAL-ids-2.txt" && echo "mesmas contas"
docker compose exec -T db psql -U catraca -d catraca -At -c "SELECT count(*) FROM users"
```

Esperado:
- `[up] Catraca no ar.` e `exit=0`; `{"status":"ok"}` e `200`.
- Log com exatamente duas linhas: `[catraca] migrations: aplicadas 0, já aplicadas N` (N ≥ 1) e `[catraca] seed: contas garantidas 3 (criadas 0, já existiam 3)`.
- `mesmas contas` (mesmos ids e e-mails do C03); `3`.

#### C14 — Migrations e seed reexecutadas sem duplicar

Depende de: C13.

```bash
docker compose exec -T app catraca migrate; echo "exit=$?"
docker compose exec -T app catraca seed; echo "exit=$?"
docker compose exec -T app catraca seed; echo "exit=$?"
docker compose exec -T db psql -U catraca -d catraca -At -c "SELECT lower(email), count(*) FROM users GROUP BY lower(email) ORDER BY 1"
```

Esperado:
- `migrate`: linha `[catraca] migrations: aplicadas 0, já aplicadas N` (N ≥ 1) e `exit=0`.
- Cada `seed`: `[catraca] seed: contas garantidas 3 (criadas 0, já existiam 3)` e `exit=0`.
- Consulta, exatamente:
  ```
  organizador.a@catraca.test|1
  organizador.b@catraca.test|1
  participante@catraca.test|1
  ```

#### C15 — Falha de migration impede a subida e mostra o erro

Depende de: C13 (ambiente no ar). A migration com erro é um arquivo **temporário, não versionado**, removido no item.

```bash
printf 'CREATE TABLE falha_proposital (id int);\nSELECT 1/0;\n' > app/migrations/29991231235959_falha_proposital.sql
npm run up > "$EVAL-up-migration.txt" 2>&1; echo "exit=$?"
grep -F -e '[up] Falha ao subir a Catraca' -e 'falha na etapa migrations' "$EVAL-up-migration.txt"
docker compose exec -T db psql -U catraca -d catraca -At -c "SELECT to_regclass('public.falha_proposital') IS NULL, (SELECT count(*) FROM schema_migrations WHERE id LIKE '%falha_proposital%')"
rm app/migrations/29991231235959_falha_proposital.sql
git status --porcelain | wc -l
npm run up; echo "exit=$?"
curl -s -w '\n%{http_code}\n' http://localhost:3000/health
```

Esperado:
- Primeiro `exit=` diferente de `0`.
- O `grep` mostra a linha `[up] Falha ao subir a Catraca (docker compose terminou com código …).` e a linha `[catraca] falha na etapa migrations: 29991231235959_falha_proposital.sql: division by zero`.
- Consulta: `t|0` (a migration foi desfeita por inteiro e não foi registrada).
- `0` (clone limpo de novo); segundo `exit=0`; `{"status":"ok"}` e `200`.

#### C16 — `AGENTS.md`, `CLAUDE.md` e README

```bash
grep -F '@AGENTS.md' CLAUDE.md
for s in 'npm run up' 'npm run down' 'npm run gates' 'http://localhost:3000' '## Regras do projeto' '## Mapa dos artefatos' 'README.md' 'docs/PRD.md' 'docs/state.json' 'docs/features/'; do grep -qF -- "$s" AGENTS.md && echo "AGENTS ok: $s" || echo "AGENTS FALTA: $s"; done
grep -c 'criado pela F01' AGENTS.md
for s in '## Como rodar' '## Endereços' '## Credenciais' '## Mapa dos artefatos' '## Decisões' 'Docker' 'Git' 'Node.js' 'npm run up' 'npm run down' 'npm run gates' '$WEB' '$API' 'http://localhost:3000' 'organizador.a@catraca.test' 'organizador.b@catraca.test' 'participante@catraca.test' 'catraca123' 'parceiro-catraca-dev' 'docs/PRD.md' 'docs/features/' 'docs/state.json' 'AGENTS.md'; do grep -qF -- "$s" README.md && echo "README ok: $s" || echo "README FALTA: $s"; done
```

Esperado:
- `CLAUDE.md` contém a linha `@AGENTS.md`.
- Todas as linhas `AGENTS ok: …` e `README ok: …`; nenhuma linha `FALTA`.
- `grep -c` imprime `0` (a tabela de comandos não está mais como "criado pela F01").
- Lendo a seção `## Como rodar` do README, os comandos de subir, derrubar e gates são os mesmos executados em C01, C09 e C06, e os pré-requisitos citam Docker, Git e Node.js.

### Encerramento (depois do C16)

```bash
npm run down
docker volume rm catraca_db-data
cd / && rm -rf "$EVAL" "$EVAL"-*
docker ps -a --filter label=com.docker.compose.project=catraca --format '{{.Names}}'
```

Esperado: listagem vazia. O encerramento não tem veredito; deixa a máquina pronta para a próxima avaliação.

## 3. Mapeamento critério → itens

| Critério (PRD) | Itens |
|----------------|-------|
| F01-CA01 | C01, C02, C03, C04, C11, C12, C15 |
| F01-CA02 | C09, C10 |
| F01-CA03 | C13, C14 |
| F01-CA04 | C06, C08 |
| F01-CA05 | C06, C07 |
| F01-CA06 | C05 |
| F01-CA07 | C16 |

C11, C12 e C15 verificam o tratamento de erros do `npm run up` descrito na F01 do PRD (porta ocupada, Docker indisponível, falha de migration) e por isso entram no F01-CA01, o critério do comando de subida. C10 verifica que `npm run down` sem nada no ar termina com código 0 (PRD, Tratamento de erros) e entra no F01-CA02.

## 4. Fora deste contrato

- **CF01 (F01 → F02)** — login do organizador A da seed com as credenciais do README, antes e depois de `npm run down`/`npm run up`: pertence ao contrato da F02, a consumidora.
- **CF02 (F01 → F03)** — gateway em modo `simulado` com os tempos do brief no ambiente subido sem `.env` (`gateway:simular` com `4000000000000001`): pertence ao contrato da F03, a consumidora.
- Links `Entrar` e `Criar conta` no topo da vitrine e qualquer página de login/cadastro: F02. Conteúdo real da vitrine: F06.
- "O produto sobe **e vende** no modo simulado sem nenhuma chave de pagamento" (brief): a venda é verificada pelo F07-CA11 (contrato da F07); aqui só a subida e a configuração (C05).
- Escala de atraso do gateway alterando os tempos só no ambiente de testes: F03-CA08 (contrato da F03); aqui só o padrão `GATEWAY_DELAY_SCALE=1` (C05).
- "A seed não cria eventos": a tabela de eventos nasce na F04; verificação no contrato da F04, se houver item para isso. Na F01 não existe tabela de eventos.
- Passo 17 do Fluxo do avaliador "as credenciais da seed continuam funcionando" após subir de novo: login é da F02 (CF01); aqui só a permanência das contas e dos ids (C13).
- Funcionamento em macOS: não verificado (o avaliador usa Linux ou WSL); a spec restringe os scripts a Node e `sh` POSIX.
- Regras de processo (relatórios imutáveis, formatadores ignorando `docs/features/*/reports/`): conferidas no fechamento do projeto, não por item deste contrato.

## 5. Alterações do contrato

Nenhuma.
