## Contract Overview

The contract (`contract.md`) is the agreement between the implementer and the evaluator. The evaluator is a separate agent with an empty context (`evaluate-feature` skill): it runs the contract item by item against the running product and records a verdict with evidence for each item. Write it so that someone who never saw the code, the spec or this conversation can execute it with only the repository, the README and the commands it names.

Rules that apply to every contract:
- **Contract-first:** written with the spec and committed before implementation starts. From then on it is frozen. An amendment is allowed only before the first evaluation and is recorded in section 5 with date and reason. Never relax an item to make an implementation pass.
- **Runtime over code reading:** items check observable behavior (HTTP response, page text, command output, database state). "The code does X" is never an item.
- **Only existing surfaces:** items may use only surfaces that exist once this feature and its dependencies are merged — never a surface of a later or parallel feature.
- **Independent items:** each item creates its own data (always new events, new buyers), unless it declares `Depende de: Cxx`.
- **Exact strings:** messages, statuses, API values and error codes are copied byte for byte from `docs/brief.md`.

---

## Structure (write in pt-BR)

```markdown
# Contrato: F<NN> — <Nome da feature>

## 1. Pré-requisitos de ambiente

- **Commit avaliado:** o avaliador registra o hash no relatório (`git rev-parse HEAD`).
- **Subir:** `<comando de subida do AGENTS.md>` · **Derrubar:** `<comando>` · **Gates:** `<comando>`
- **Endereços:** `$WEB=<url>`, `$API=<url>`; **chave de parceiro:** `$KEY` (README).
- **Contas da seed:** organizador A (`<e-mail>`), organizador B (`<e-mail>`), participante (`<e-mail>`); senhas no README.
- **Modo:** padrão (gateway com os tempos do brief) salvo quando o item disser o contrário.
- **Ferramentas do avaliador:** `curl`, `docker`, `node`, navegador (para itens UI).

## 2. Itens verificáveis

| ID | Item | Tipo | Como verificar | Resultado esperado | Regras |
|----|------|------|----------------|--------------------|--------|
| C01 | Rascunho fora da listagem da API | HTTP | 1. Como organizador A, criar evento sem publicar. 2. `curl -s -H "X-Api-Key: $KEY" "$API/api/partner/events"` | `200`; o id do rascunho não aparece no array | R02 |
| C02 | ... | ... | ... | ... | ... |

## 3. Mapeamento critério → itens

| Critério (PRD) | Itens |
|----------------|-------|
| F<NN>-CA01 | C01, C02 |
| CF<NN> (F<prov> → F<NN>) | C07 |

## 4. Fora deste contrato

- <o que esta feature não verifica e qual feature/contrato cobre>

## 5. Alterações do contrato

Nenhuma.
```

---

## Item types

| Type | How to write "Como verificar" | How to write "Resultado esperado" |
|------|-------------------------------|-----------------------------------|
| `HTTP` | Full `curl` command with headers and body, using `$API`, `$KEY`, ids saved from earlier steps | Status code + exact JSON fields/values (`{"error":"sold_out"}`) |
| `UI` | Numbered browser steps: URL, account, clicks, values typed | Exact text visible on the page (in backticks), or what must NOT appear |
| `CLI` | Command and working directory | Exit code and the relevant output lines |
| `DB` | `docker compose exec <service> <query>` | Rows/values returned |
| `TEST` | Gates command or a named test (file + test name with the criterion ID) | Passes; number of tests run |
| `TEMPO` | Steps + what to wait for and how (recarregar, consultar a cada 1 s) | The state reached and the deadline (`em até 5 s`, `após 45 s continua ...`) |

## Rules for items

- Each item is executable exactly as written: no "etc.", no "check that it works".
- Expected results are objective and complete: HTTP status **and** body, exact message, panel number, exit code.
- Cover failure paths (validation, not found, unauthorized, sold out, forbidden) — not only success.
- Time-bound rules state the wait and the deadline: gateway `…0001`/`…0002` 2–5 s, `…0003`/`…0004` 30–40 s, cancellation effects ≤ 10 s, late gateway response after 45 s leaves the status unchanged.
- Concurrency (R07): run the burst (30 simultaneous purchases, capacity 5) at least 3 times, each on a fresh event; the item passes only if every round gives exactly 5 × `202` and 25 × `409` and occupied seats never exceed capacity. Provide the command (Node script or the `xargs` burst from the brief).
- A `TEST` item may support a criterion, but a criterion with a runtime surface (HTTP or UI) also needs at least one `HTTP`/`UI`/`TEMPO` item: the evaluator must see the behavior in the running product.
- Organizer isolation (R13): check the list **and** the direct URL of another organizer's management page, logged in as the other organizer, as the participant and logged out.

## Mapping rules

- Every per-feature criterion `F<NN>-CA<NN>` of this feature appears with at least one item.
- Every cross-feature criterion where this feature is the consumer appears with at least one item. A cross-feature criterion involving several features belongs to the contract of the involved feature implemented last.
- No orphan items: each item maps to at least one criterion.
- The "Regras" column of the items, taken together, covers every rule cited by the mapped criteria.
