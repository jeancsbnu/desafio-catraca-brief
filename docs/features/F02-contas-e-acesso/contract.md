# Contrato: F02 — Contas e acesso

## 1. Pré-requisitos de ambiente

- **Commit avaliado:** o avaliador registra o hash no relatório (`git rev-parse HEAD` na pasta do repositório avaliado — `main`, branch ou worktree da F02).
- **Onde roda:** na pasta do repositório avaliado, num shell `bash` (Linux ou WSL). Todos os comandos rodam na raiz dessa pasta (o `docker compose` precisa do `compose.yaml` dela).
- **Subir:** `npm run up` · **Derrubar:** `npm run down` · **Gates:** `npm run gates` (comandos do `AGENTS.md`; nenhum `npm install`).
- **Endereços:** `$WEB` = `$API` = `http://localhost:3000`. Se a pasta avaliada tiver um `.env` com `CATRACA_PORT`, use essa porta em `WEB` e na checagem de porta; nenhum resultado esperado muda (os `location` são caminhos relativos). **Chave de parceiro:** `parceiro-catraca-dev` (README); não é usada neste contrato — a API de parceiros é da F07.
- **Contas da seed:** organizador A (`organizador.a@catraca.test`), organizador B (`organizador.b@catraca.test`), participante (`participante@catraca.test`); senha `catraca123` para as três, conforme o README (seção "Credenciais").
- **Modo:** padrão — nenhuma variável de ambiente exportada no shell além das definidas na Preparação.
- **Ferramentas do avaliador:** `bash`, `git`, `curl`, `awk`, `docker` com Compose v2, `node` (LTS). Navegador só para o roteiro opcional (seção 2.2).
- **Ordem:** os itens rodam na ordem numérica, na mesma sessão de shell (variáveis e funções da Preparação). Cada item cria os próprios dados (e-mails novos com o sufixo `$U`, cookie jars próprios), exceto quando declara `Depende de`. O C17 reinicia o ambiente e por isso é o último.
- **Dados criados:** contas de participante `*.$U@example.com` e sessões. Nenhum evento.

### Preparação (antes do C01)

```bash
# na raiz da pasta do repositório avaliado
git status --porcelain | wc -l
git rev-parse HEAD
npm run down
curl -s -o /dev/null -w '%{http_code}\n' --max-time 3 http://localhost:3000/; echo "curl_exit=$?"
npm run up; echo "exit=$?"

WEB=http://localhost:3000
T=$(mktemp -d /tmp/catraca-f02-XXXXXX)
U=$(date +%s)
S43=$(printf 'A%.0s' $(seq 43))
# req <id> [opções do curl] <url>: imprime o status HTTP e, depois, as linhas location/set-cookie da resposta
# (nome do cabeçalho em minúsculas); guarda o corpo em $T/<id>.html
req() { id=$1; shift; curl -s -o "$T/$id.html" -D "$T/$id.h" -w '%{http_code}\n' "$@"; tr -d '\r' < "$T/$id.h" | awk '{ i = index($0, ":"); n = tolower(substr($0, 1, i - 1)); if (n == "location" || n == "set-cookie") print n ":" substr($0, i + 1) }'; }
# conta <id> <texto>: quantas vezes o texto aparece no corpo guardado
conta() { grep -oF -- "$2" "$T/$1.html" | wc -l | tr -d ' '; }
# tem / naotem <id> <texto>...: presença ou ausência de cada texto no corpo guardado
tem() { id=$1; shift; for s in "$@"; do grep -qF -- "$s" "$T/$id.html" && echo "ok: $s" || echo "FALTA: $s"; done; }
naotem() { id=$1; shift; for s in "$@"; do grep -qF -- "$s" "$T/$id.html" && echo "INDEVIDO: $s" || echo "ausente: $s"; done; }
# sql <consulta>: consulta no banco do ambiente
sql() { docker compose exec -T db psql -U catraca -d catraca -At -c "$1"; }
# entrar <id> <cookie jar> <e-mail> [senha]: POST /entrar (senha padrão: a da seed)
entrar() { req "$1" -c "$2" -b "$2" --data-urlencode "email=$3" --data-urlencode "senha=${4-catraca123}" "$WEB/entrar"; }
echo "T=$T U=$U"
```

Esperado: `0` (árvore limpa); o hash do commit; `npm run down` termina; o `curl` imprime `000` e `curl_exit=7` (porta 3000 livre — se não estiver, libere-a antes de seguir); `npm run up` termina com `[up] Catraca no ar.` e `exit=0`; a última linha mostra `T=/tmp/catraca-f02-…` e `U=<número>`.

**Convenções dos resultados esperados:**
- A saída de `req` é o status na primeira linha e, depois, as linhas `location:`/`set-cookie:`; a ordem entre `location` e `set-cookie` não importa. "Nenhuma outra linha" quer dizer que a resposta não tem `location` nem `set-cookie`.
- **[cria]** = uma linha `set-cookie: catraca_sessao=<valor>; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax`, com `<valor>` de 87 caracteres no formato `<43 caracteres [A-Za-z0-9_-]>.<43 caracteres [A-Za-z0-9_-]>`.
- **[limpa]** = a linha exata `set-cookie: catraca_sessao=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`.

## 2. Itens verificáveis

A tabela é o índice. Os comandos exatos e o resultado completo de cada item estão no roteiro 2.1, que prevalece sobre o resumo.

| ID | Item | Tipo | Como verificar (resumo) | Resultado esperado (resumo) | Regras |
|----|------|------|-------------------------|-----------------------------|--------|
| C01 | Páginas públicas com navegação de visitante | HTTP | `GET /`, `/cadastro`, `/entrar` e uma página inexistente, sem cookie | `200` (404 na inexistente); links `Entrar` e `Criar conta` no topo; formulários de cadastro (Nome, E-mail, Senha) e de login (E-mail, Senha) | — |
| C02 | Cadastro cria participante logado com o nome no topo | HTTP + DB | `POST /cadastro` com nome, e-mail novo e senha ≥ 8; `GET /` com o cookie; `psql` | `302` `location: /` [cria]; topo com o nome, `Meus ingressos` e `Sair`, sem `Entrar`/`Criar conta`; conta `participante`; 1 sessão | — |
| C03 | Senha só como hash, fora das páginas e dos logs | DB + CLI | Depende de C02. `psql`; `grep` nas páginas guardadas e em `docker compose logs app` | Hash `scrypt$…` sem a senha; senha em 0 páginas e 0 linhas de log | — |
| C04 | E-mail já cadastrado, com outras maiúsculas | HTTP + DB | `POST /cadastro` com `PARTICIPANTE@catraca.test` e com `Organizador.A@Catraca.Test` | `422` sem `set-cookie`; `E-mail já cadastrado`; nome e e-mail repostos, senha não; contas da seed inalteradas | — |
| C05 | Validações do cadastro | HTTP + DB | Senha de 7 caracteres; e-mail `nao-e-um-email`; nome vazio; nome só com espaços; senha de exatamente 8 | `422` com `A senha precisa ter pelo menos 8 caracteres`, `Informe um e-mail válido`, `Informe o nome` (acima do formulário); nenhuma conta criada; 8 caracteres → `302` | — |
| C06 | Campo extra `papel=organizador` cria participante | HTTP + DB | `POST /cadastro` com `papel=organizador` e `role=organizador`; `psql`; `GET /organizador` | `302` `location: /` [cria]; papel `participante`; `/organizador` → `403` `Acesso negado` | R13 |
| C07 | Login do organizador A leva a `/organizador` | HTTP + DB | `POST /entrar` com as credenciais da seed (e com o e-mail em outras maiúsculas e espaços); `GET /organizador`; `psql` | `302` `location: /organizador` [cria]; página `Área do organizador` com `Organizador A` e `Sair`; sessão de 43200 s | — |
| C08 | Login do participante leva à vitrine | HTTP | `POST /entrar` com o participante da seed; `GET /` | `302` `location: /` [cria]; topo com `Participante`, `Meus ingressos` e `Sair`, sem link para `/organizador` | — |
| C09 | Mensagem única para credenciais erradas | HTTP | Senha errada; e-mail inexistente; campos vazios | `422` sem `set-cookie` nos três; `E-mail ou senha inválidos`; e-mail reposto, senha não | — |
| C10 | Volta à página de origem depois do login | HTTP | `GET /meus-ingressos` deslogado; `GET /entrar?voltar=…`; login com `voltar`; organizador com `voltar` | `302` `/entrar?voltar=%2Fmeus-ingressos`; campo oculto; participante volta ao destino (com query); organizador vai a `/organizador` | — |
| C11 | Parâmetro de volta não permite open redirect | HTTP | Login de participante com 7 valores maliciosos de `voltar`; `GET /entrar?voltar=https%3A…` | Sempre `302` `location: /`; o valor malicioso nunca aparece no formulário | — |
| C12 | `Sair` encerra a sessão de verdade | HTTP | Participante e organizador: entrar, `POST /sair`, acessar `/meus-ingressos` e `/organizador` com o jar e reenviando o cookie antigo | `302` `location: /` [limpa]; depois, `/meus-ingressos` → `/entrar?voltar=%2Fmeus-ingressos` e `/organizador` → `/entrar`, também com o cookie antigo | — |
| C13 | Visitante na área do organizador vai para `/entrar` | HTTP | 5 caminhos sob `/organizador` (inclusive inexistentes e codificado) e um `POST`, sem cookie | `302` `location: /entrar` em todos | R13 |
| C14 | Participante na área do organizador recebe `403` | HTTP | Os mesmos caminhos e `POST` com o participante logado | `403` com `<h1>Acesso negado</h1>` e sem `<h1>Área do organizador</h1>` em todos | R13 |
| C15 | Cookie adulterado ou sessão expirada = visitante | HTTP + DB | Organizador B: cookie com assinatura trocada, sem assinatura, e sessão expirada no banco | `302` `location: /entrar` [limpa] nos três; o cookie original funcionava antes (`200`) | R13 |
| C16 | Requisição de outra origem não usa a sessão | HTTP | `POST /sair` e `POST /entrar` com `Origin` de outro site, `Origin: null` e `Sec-Fetch-Site: cross-site`; depois com `Origin` do próprio produto | `403` `Origem da requisição não permitida.` sem efeito (sessão continua); com a origem do produto, `302` [limpa] | R13 |
| C17 | CF01: organizador A da seed entra antes e depois de derrubar e subir | CLI + HTTP | Credenciais no README; login; `npm run down`; `npm run up`; login de novo; sessão anterior | `302` `location: /organizador` antes e depois; `exit=0` no down e no up; página `Área do organizador` com `Organizador A`; sessão anterior continua válida | — |

### 2.1 Roteiro detalhado

#### C01 — Páginas públicas com navegação de visitante

```bash
req c01a "$WEB/"
tem c01a '<a href="/entrar">Entrar</a>' '<a href="/cadastro">Criar conta</a>'
naotem c01a '<button type="submit">Sair</button>' 'nav-usuario'
req c01b "$WEB/cadastro"
tem c01b '<h1>Criar conta</h1>' '<form method="post" action="/cadastro">' 'name="nome"' 'name="email"' 'name="senha"' 'type="password"' '<a href="/entrar">Entrar</a>'
req c01c "$WEB/entrar"
tem c01c '<h1>Entrar</h1>' '<form method="post" action="/entrar">' 'name="email"' 'name="senha"' '<a href="/cadastro">Criar conta</a>'
req c01d "$WEB/pagina-que-nao-existe"
tem c01d '<a href="/entrar">Entrar</a>' '<a href="/cadastro">Criar conta</a>'
```

Esperado:
- `c01a`, `c01b`, `c01c`: `200` e nenhuma outra linha; `c01d`: `404` e nenhuma outra linha.
- Todas as linhas dos `tem` começam com `ok:` e as do `naotem` com `ausente:`; nenhuma `FALTA` nem `INDEVIDO`.

#### C02 — Cadastro cria participante logado com o nome no topo

```bash
N="Ana F02 $U"; E="ana.f02.$U@example.com"; P="Senha-F02-$U"
req c02a -c "$T/c02.jar" -b "$T/c02.jar" --data-urlencode "nome=$N" --data-urlencode "email=$E" --data-urlencode "senha=$P" "$WEB/cadastro" | tee "$T/c02a.out"
grep -cE '^set-cookie: catraca_sessao=[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax$' "$T/c02a.out"
req c02b -b "$T/c02.jar" "$WEB/"
tem c02b "<span class=\"nav-usuario\">$N</span>" '<a href="/meus-ingressos">Meus ingressos</a>' '<button type="submit">Sair</button>'
naotem c02b '<a href="/entrar">Entrar</a>' '<a href="/cadastro">Criar conta</a>' 'href="/organizador"'
sql "SELECT role, name FROM users WHERE lower(email) = lower('$E')"
sql "SELECT count(*) FROM sessions s JOIN users u ON u.id = s.user_id WHERE lower(u.email) = lower('$E')"
```

Esperado:
- `c02a`: `302`, `location: /` e [cria]; o `grep -cE` imprime `1`.
- `c02b`: `200` e nenhuma outra linha; três `ok:` e três `ausente:`.
- Primeira consulta: `participante|Ana F02 <U>` (com o valor de `$U`). Segunda: `1`.

#### C03 — Senha só como hash, fora das páginas e dos logs

Depende de: C02 (variáveis `E` e `P`).

```bash
sql "SELECT password_hash LIKE 'scrypt\$%', position('$P' in password_hash) = 0 FROM users WHERE lower(email) = lower('$E')"
grep -lF -- "$P" "$T"/*.html | wc -l
docker compose logs --no-color app | grep -cF -- "$P"
```

Esperado: `t|t`; `0` (nenhuma página guardada contém a senha); `0` (nenhuma linha de log contém a senha).

#### C04 — E-mail já cadastrado, com outras maiúsculas

```bash
req c04a -c "$T/c04.jar" -b "$T/c04.jar" --data-urlencode 'nome=Outra Pessoa' --data-urlencode 'email=PARTICIPANTE@catraca.test' --data-urlencode 'senha=outrasenha123' "$WEB/cadastro"
conta c04a 'E-mail já cadastrado'
tem c04a 'value="Outra Pessoa"' 'value="PARTICIPANTE@catraca.test"'
conta c04a 'outrasenha123'
req c04b -c "$T/c04.jar" -b "$T/c04.jar" --data-urlencode 'nome=Outra Pessoa' --data-urlencode 'email=Organizador.A@Catraca.Test' --data-urlencode 'senha=outrasenha123' "$WEB/cadastro"
conta c04b 'E-mail já cadastrado'
sql "SELECT lower(email), role, name FROM users WHERE lower(email) IN ('participante@catraca.test', 'organizador.a@catraca.test') ORDER BY 1"
```

Esperado:
- `c04a`: `422` e nenhuma outra linha; `1`; dois `ok:`; `0` (a senha não volta na página).
- `c04b`: `422` e nenhuma outra linha; `1`.
- Consulta, exatamente:
  ```
  organizador.a@catraca.test|organizador|Organizador A
  participante@catraca.test|participante|Participante
  ```

#### C05 — Validações do cadastro

```bash
req c05a --data-urlencode "nome=Bia $U" --data-urlencode "email=curta.$U@example.com" --data-urlencode 'senha=1234567' "$WEB/cadastro"
conta c05a 'A senha precisa ter pelo menos 8 caracteres'
req c05b --data-urlencode "nome=Bia $U" --data-urlencode 'email=nao-e-um-email' --data-urlencode 'senha=senha-valida-1' "$WEB/cadastro"
conta c05b 'Informe um e-mail válido'
req c05c --data-urlencode 'nome=' --data-urlencode "email=semnome.$U@example.com" --data-urlencode 'senha=senha-valida-1' "$WEB/cadastro"
conta c05c 'Informe o nome'
node -e "const s = require('fs').readFileSync(process.argv[1], 'utf8'); const m = s.indexOf('Informe o nome'); console.log(m >= 0 && m < s.indexOf('action=\"/cadastro\"'))" "$T/c05c.html"
req c05d --data-urlencode 'nome=   ' --data-urlencode "email=espacos.$U@example.com" --data-urlencode 'senha=senha-valida-1' "$WEB/cadastro"
conta c05d 'Informe o nome'
sql "SELECT count(*) FROM users WHERE lower(email) IN ('curta.$U@example.com', 'nao-e-um-email', 'semnome.$U@example.com', 'espacos.$U@example.com')"
req c05e --data-urlencode "nome=Oito $U" --data-urlencode "email=oito.$U@example.com" --data-urlencode 'senha=12345678' "$WEB/cadastro"
sql "SELECT role FROM users WHERE lower(email) = 'oito.$U@example.com'"
```

Esperado:
- `c05a`, `c05b`, `c05c`, `c05d`: `422` e nenhuma outra linha, cada um seguido de `1` (a mensagem exata aparece uma vez).
- O `node` imprime `true` (a mensagem aparece antes do formulário).
- Primeira consulta: `0` (nenhuma das quatro contas foi criada).
- `c05e`: `302`, `location: /` e [cria]; consulta: `participante`.

#### C06 — Campo extra `papel=organizador` cria participante

```bash
req c06a -c "$T/c06.jar" -b "$T/c06.jar" --data-urlencode "nome=Caio F02 $U" --data-urlencode "email=caio.f02.$U@example.com" --data-urlencode 'senha=senha-caio-1' --data-urlencode 'papel=organizador' --data-urlencode 'role=organizador' "$WEB/cadastro"
sql "SELECT role FROM users WHERE lower(email) = 'caio.f02.$U@example.com'"
req c06b -b "$T/c06.jar" "$WEB/organizador"
conta c06b '<h1>Acesso negado</h1>'
```

Esperado: `c06a`: `302`, `location: /` e [cria]; consulta: `participante`; `c06b`: `403` e nenhuma outra linha; `1`.

#### C07 — Login do organizador A leva a `/organizador`

```bash
entrar c07a "$T/c07.jar" organizador.a@catraca.test
req c07b -b "$T/c07.jar" "$WEB/organizador"
tem c07b '<h1>Área do organizador</h1>' '<span class="nav-usuario">Organizador A</span>' '<a href="/organizador">Área do organizador</a>' '<button type="submit">Sair</button>'
naotem c07b '<a href="/meus-ingressos">Meus ingressos</a>' '<a href="/entrar">Entrar</a>'
sql "SELECT round(extract(epoch FROM s.expires_at - s.created_at)) FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = 'organizador.a@catraca.test' ORDER BY s.created_at DESC LIMIT 1"
entrar c07c "$T/c07m.jar" ' Organizador.A@CATRACA.test '
```

Esperado:
- `c07a`: `302`, `location: /organizador` e [cria].
- `c07b`: `200` e nenhuma outra linha; quatro `ok:` e dois `ausente:`.
- Consulta: `43200` (sessão de 12 horas).
- `c07c`: `302`, `location: /organizador` e [cria] (e-mail comparado sem diferenciar maiúsculas e sem os espaços das pontas).

#### C08 — Login do participante leva à vitrine

```bash
entrar c08a "$T/c08.jar" participante@catraca.test
req c08b -b "$T/c08.jar" "$WEB/"
tem c08b '<span class="nav-usuario">Participante</span>' '<a href="/meus-ingressos">Meus ingressos</a>' '<button type="submit">Sair</button>'
naotem c08b 'href="/organizador"' '<a href="/entrar">Entrar</a>'
```

Esperado: `c08a`: `302`, `location: /` e [cria]; `c08b`: `200` e nenhuma outra linha; três `ok:` e dois `ausente:`.

#### C09 — Mensagem única para credenciais erradas

```bash
entrar c09a "$T/c09.jar" organizador.a@catraca.test senha-errada-9
conta c09a 'E-mail ou senha inválidos'
tem c09a 'value="organizador.a@catraca.test"'
conta c09a 'senha-errada-9'
entrar c09b "$T/c09.jar" "naoexiste.$U@example.com" catraca123
conta c09b 'E-mail ou senha inválidos'
naotem c09b 'Informe' 'já cadastrado'
entrar c09c "$T/c09.jar" '' ''
conta c09c 'E-mail ou senha inválidos'
```

Esperado:
- `c09a`: `422` e nenhuma outra linha; `1`; `ok:`; `0`.
- `c09b`: `422` e nenhuma outra linha; `1`; dois `ausente:` (nenhuma pista de que o e-mail não existe).
- `c09c`: `422` e nenhuma outra linha; `1`.

#### C10 — Volta à página de origem depois do login

```bash
req c10a "$WEB/meus-ingressos"
req c10b "$WEB/entrar?voltar=%2Fmeus-ingressos"
conta c10b '<input type="hidden" name="voltar" value="/meus-ingressos">'
req c10c -c "$T/c10.jar" -b "$T/c10.jar" --data-urlencode 'email=participante@catraca.test' --data-urlencode 'senha=catraca123' --data-urlencode 'voltar=/meus-ingressos' "$WEB/entrar"
req c10d -b "$T/c10.jar" "$WEB/meus-ingressos"
conta c10d '<h1>Meus ingressos</h1>'
req c10e --data-urlencode 'email=participante@catraca.test' --data-urlencode 'senha=catraca123' --data-urlencode 'voltar=/eventos/evt_exemplo?origem=f02' "$WEB/entrar"
req c10f --data-urlencode 'email=organizador.a@catraca.test' --data-urlencode 'senha=catraca123' --data-urlencode 'voltar=/meus-ingressos' "$WEB/entrar"
```

Esperado:
- `c10a`: `302` e `location: /entrar?voltar=%2Fmeus-ingressos` (nenhuma outra linha).
- `c10b`: `200` e nenhuma outra linha; `1`.
- `c10c`: `302`, `location: /meus-ingressos` e [cria].
- `c10d`: `200` e nenhuma outra linha; `1`.
- `c10e`: `302`, `location: /eventos/evt_exemplo?origem=f02` e [cria] (a query é preservada).
- `c10f`: `302`, `location: /organizador` e [cria] (organizador ignora o `voltar`).

#### C11 — Parâmetro de volta não permite open redirect

```bash
for v in 'https://evil.example/' '//evil.example/x' '/\evil.example' "$(printf '/\t/evil.example')" 'javascript:alert(1)' 'http:/evil.example' '/entrar'; do
  req c11 --data-urlencode 'email=participante@catraca.test' --data-urlencode 'senha=catraca123' --data-urlencode "voltar=$v" "$WEB/entrar" | grep -E '^([0-9]{3}$|location:)' | tr '\n' ' '; echo
done
req c11b "$WEB/entrar?voltar=https%3A%2F%2Fevil.example%2F"
conta c11b 'evil.example'
conta c11b 'name="voltar"'
```

Esperado:
- O laço imprime exatamente 7 linhas, todas `302 location: /` (com um espaço no fim).
- `c11b`: `200` e nenhuma outra linha; `0`; `0` (o valor malicioso é descartado e não há campo oculto).

#### C12 — `Sair` encerra a sessão de verdade

```bash
entrar c12a "$T/c12.jar" participante@catraca.test
OLD=$(awk '$6 == "catraca_sessao" { print $7 }' "$T/c12.jar"); echo "${#OLD}"
req c12b -b "$T/c12.jar" "$WEB/meus-ingressos"
req c12c -b "$T/c12.jar" -c "$T/c12.jar" -X POST "$WEB/sair"
req c12d -b "$T/c12.jar" "$WEB/meus-ingressos"
req c12e -b "$T/c12.jar" "$WEB/organizador"
req c12f -H "Cookie: catraca_sessao=$OLD" "$WEB/meus-ingressos"
req c12g -H "Cookie: catraca_sessao=$OLD" "$WEB/organizador"
entrar c12h "$T/c12o.jar" organizador.a@catraca.test
OLDO=$(awk '$6 == "catraca_sessao" { print $7 }' "$T/c12o.jar"); echo "${#OLDO}"
req c12i -b "$T/c12o.jar" "$WEB/organizador"
req c12j -b "$T/c12o.jar" -c "$T/c12o.jar" -X POST "$WEB/sair"
req c12k -b "$T/c12o.jar" "$WEB/organizador"
req c12l -H "Cookie: catraca_sessao=$OLDO" "$WEB/organizador"
req c12m -H "Cookie: catraca_sessao=$OLDO" "$WEB/meus-ingressos"
```

Esperado:
- `c12a`: `302`, `location: /` e [cria]; `87`.
- `c12b`: `200` e nenhuma outra linha.
- `c12c`: `302`, `location: /` e [limpa].
- `c12d`: `302` e `location: /entrar?voltar=%2Fmeus-ingressos` (nenhuma outra linha).
- `c12e`: `302` e `location: /entrar` (nenhuma outra linha).
- `c12f`: `302`, `location: /entrar?voltar=%2Fmeus-ingressos` e [limpa] (o cookie antigo não vale mais).
- `c12g`: `302`, `location: /entrar` e [limpa].
- `c12h`: `302`, `location: /organizador` e [cria]; `87`.
- `c12i`: `200` e nenhuma outra linha.
- `c12j`: `302`, `location: /` e [limpa].
- `c12k`: `302` e `location: /entrar` (nenhuma outra linha).
- `c12l`: `302`, `location: /entrar` e [limpa].
- `c12m`: `302`, `location: /entrar?voltar=%2Fmeus-ingressos` e [limpa].

#### C13 — Visitante na área do organizador vai para `/entrar`

```bash
for p in /organizador /organizador/ /organizador/eventos/novo /organizador/eventos/evt_inexistente /%6Frganizador; do
  printf '%s ' "$p"; req c13 "$WEB$p" | tr '\n' ' '; echo
done
req c13p --data-urlencode 'nome=Evento qualquer' "$WEB/organizador/eventos"
```

Esperado:
- 5 linhas, cada uma com o caminho seguido de `302 location: /entrar` (e nada mais).
- `c13p`: `302` e `location: /entrar` (nenhuma outra linha).

#### C14 — Participante na área do organizador recebe `403`

```bash
entrar c14a "$T/c14.jar" participante@catraca.test
for p in /organizador /organizador/ /organizador/eventos/novo /organizador/eventos/evt_inexistente /%6Frganizador; do
  printf '%s | %s| %s | %s\n' "$p" "$(req c14 -b "$T/c14.jar" "$WEB$p" | tr '\n' ' ')" "$(conta c14 '<h1>Acesso negado</h1>')" "$(conta c14 '<h1>Área do organizador</h1>')"
done
req c14p -b "$T/c14.jar" --data-urlencode 'nome=Evento qualquer' "$WEB/organizador/eventos"
conta c14p '<h1>Acesso negado</h1>'
```

Esperado:
- `c14a`: `302`, `location: /` e [cria].
- 5 linhas no formato `<caminho> | 403 | 1 | 0` (status `403` sem `location` nem `set-cookie`; a página tem `Acesso negado` e não tem o título da área).
- `c14p`: `403` e nenhuma outra linha; `1`.

#### C15 — Cookie adulterado ou sessão expirada = visitante

Só o organizador B é usado neste item.

```bash
entrar c15a "$T/c15.jar" organizador.b@catraca.test
V=$(awk '$6 == "catraca_sessao" { print $7 }' "$T/c15.jar")
req c15b -H "Cookie: catraca_sessao=$V" "$WEB/organizador"
req c15c -H "Cookie: catraca_sessao=${V%%.*}.$S43" "$WEB/organizador"
req c15d -H "Cookie: catraca_sessao=${V%%.*}" "$WEB/organizador"
sql "UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = (SELECT id FROM users WHERE email = 'organizador.b@catraca.test')"
req c15e -H "Cookie: catraca_sessao=$V" "$WEB/organizador"
```

Esperado:
- `c15a`: `302`, `location: /organizador` e [cria].
- `c15b`: `200` e nenhuma outra linha (o cookie original é aceito).
- `c15c` (assinatura trocada) e `c15d` (sem assinatura): `302`, `location: /entrar` e [limpa].
- `UPDATE` seguido de um número ≥ 1.
- `c15e` (sessão expirada): `302`, `location: /entrar` e [limpa].

#### C16 — Requisição de outra origem não usa a sessão

```bash
entrar c16a "$T/c16.jar" organizador.a@catraca.test
req c16b -b "$T/c16.jar" -c "$T/c16.jar" -H 'Origin: http://evil.example' -X POST "$WEB/sair"
conta c16b 'Origem da requisição não permitida.'
req c16c -b "$T/c16.jar" -c "$T/c16.jar" -H 'Sec-Fetch-Site: cross-site' -X POST "$WEB/sair"
req c16d -b "$T/c16.jar" -c "$T/c16.jar" -H 'Origin: null' -X POST "$WEB/sair"
req c16e -b "$T/c16.jar" "$WEB/organizador"
req c16f -H 'Origin: http://evil.example' --data-urlencode 'email=organizador.a@catraca.test' --data-urlencode 'senha=catraca123' "$WEB/entrar"
req c16g -b "$T/c16.jar" -c "$T/c16.jar" -H "Origin: $WEB" -X POST "$WEB/sair"
req c16h -b "$T/c16.jar" "$WEB/organizador"
```

Esperado:
- `c16a`: `302`, `location: /organizador` e [cria].
- `c16b`: `403` e nenhuma outra linha; `1`.
- `c16c` e `c16d`: `403` e nenhuma outra linha.
- `c16e`: `200` e nenhuma outra linha (a sessão não foi encerrada pelas requisições bloqueadas).
- `c16f`: `403` e nenhuma outra linha (nenhuma sessão criada).
- `c16g`: `302`, `location: /` e [limpa] (mesma origem: a saída funciona).
- `c16h`: `302` e `location: /entrar` (nenhuma outra linha).

#### C17 — CF01: organizador A da seed entra antes e depois de derrubar e subir

Roda por último: derruba e sobe o ambiente.

```bash
grep -cF 'organizador.a@catraca.test' README.md
grep -cF 'catraca123' README.md
entrar c17a "$T/c17a.jar" organizador.a@catraca.test
req c17b -b "$T/c17a.jar" "$WEB/organizador"
conta c17b '<h1>Área do organizador</h1>'
npm run down; echo "exit=$?"
curl -s -o /dev/null -w '%{http_code}\n' --max-time 3 "$WEB/"; echo "curl_exit=$?"
npm run up; echo "exit=$?"
entrar c17c "$T/c17c.jar" organizador.a@catraca.test
req c17d -b "$T/c17c.jar" "$WEB/organizador"
tem c17d '<h1>Área do organizador</h1>' '<span class="nav-usuario">Organizador A</span>'
req c17e -b "$T/c17a.jar" "$WEB/organizador"
conta c17e '<h1>Área do organizador</h1>'
```

Esperado:
- Os dois `grep -cF` imprimem números ≥ 1 (as credenciais usadas são as do README).
- `c17a`: `302`, `location: /organizador` e [cria]; `c17b`: `200` e nenhuma outra linha; `1`.
- `npm run down`: `exit=0`; `curl`: `000` e `curl_exit=7`.
- `npm run up`: `[up] Catraca no ar.` e `exit=0`.
- `c17c`: `302`, `location: /organizador` e [cria]; `c17d`: `200` e nenhuma outra linha; dois `ok:`.
- `c17e`: `200` e nenhuma outra linha; `1` (a sessão aberta antes do reinício continua válida, porque está no banco).

### Encerramento (depois do C17)

```bash
rm -rf "$T"
```

Sem veredito. O `npm run down` final é feito pela skill de avaliação.

### 2.2 Roteiro opcional no navegador (sem veredito)

Complementa os itens acima para quem quiser ver as telas; não substitui nenhum item.

1. Abrir `$WEB/` deslogado: o topo mostra `Entrar` e `Criar conta`.
2. Clicar em `Criar conta`, preencher Nome, um E-mail novo e uma Senha de 8 ou mais caracteres e enviar: volta à vitrine com o nome no topo, `Meus ingressos` e `Sair`.
3. Clicar em `Sair`: o topo volta a mostrar `Entrar` e `Criar conta`.
4. Abrir `$WEB/organizador` deslogado: aparece a página `Entrar`.
5. Entrar com `participante@catraca.test` e abrir `$WEB/organizador`: página `Acesso negado`.
6. Sair, entrar com `organizador.a@catraca.test`: abre `Área do organizador`, com `Organizador A` no topo.
7. Sair e, em `Criar conta`, enviar a senha `1234567`: a mensagem `A senha precisa ter pelo menos 8 caracteres` aparece acima do formulário, com nome e e-mail mantidos e a senha vazia.

## 3. Mapeamento critério → itens

| Critério (PRD) | Itens |
|----------------|-------|
| F02-CA01 | C01, C02, C03 |
| F02-CA02 | C04 |
| F02-CA03 | C05 |
| F02-CA04 | C07, C08, C09, C10, C11 |
| F02-CA05 | C12 |
| F02-CA06 | C13, C14, C15, C16 |
| F02-CA07 | C06 |
| CF01 (F01 → F02) | C17 |

Notas do mapeamento:
- C01 verifica a porta de entrada do F02-CA01 (formulário de cadastro e links `Entrar`/`Criar conta` no topo, Experiência 1 do PRD); C03 verifica a capacidade "senhas só como hash, nunca em logs nem em páginas" do cadastro.
- C10 e C11 verificam o destino do login (F02-CA04) quando o participante chega por uma página protegida, e que esse destino nunca sai do produto.
- C15 verifica o tratamento de erro do PRD "sessão expirada ou cookie adulterado: tratada como visitante (redirecionamento para `/entrar`)" na área do organizador (F02-CA06). C16 verifica que a sessão de um organizador não pode ser usada por outro site para operar a área (a proteção de F02-CA06 vale também contra requisições forjadas).
- C07 também apoia o CF01 (login do organizador A com as credenciais da seed).

## 4. Fora deste contrato

- **CF03 (F02 → F04)** — gestão de eventos só com sessão de organizador e isolamento entre organizadores (lista e URL direta): contrato da F04, a consumidora. Aqui só a área do organizador em si (C13, C14).
- **CF07 (F02 → F06)** — compra na vitrine exige participante e volta ao evento depois do login; "Meus ingressos" de uma conta nunca mostra ingressos de outra: contrato da F06. Aqui só o mecanismo de volta (C10, C11) e a página mínima `/meus-ingressos`.
- Organizador logado em página de participante (`/meus-ingressos`, compra) e a mensagem `Compras são feitas com uma conta de participante`: F06 (F06-CA05).
- Conteúdo real de `/organizador` (lista de eventos, `Novo evento`) e de `/meus-ingressos` (ingressos): F04 e F06. Este contrato só usa os títulos `<h1>Área do organizador</h1>` e `<h1>Meus ingressos</h1>`.
- Isolamento entre organizadores (R13, "cada organizador só vê os próprios eventos"): F04-CA08 e CF03.
- Testes automatizados da F02 (`app/test/f02/`): executados pelos gates (`npm run gates`), que a skill de avaliação roda como `G1`.
- Recuperação de senha, edição de perfil, limite de tentativas de login: fora de escopo do PRD.

## 5. Alterações do contrato

Nenhuma.
