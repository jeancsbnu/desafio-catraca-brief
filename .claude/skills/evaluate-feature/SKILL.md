---
name: evaluate-feature
description: Independently evaluates a Catraca feature against its contract.md, in a fresh context separate from the implementer, and writes a new immutable evaluation report (date, evaluated commit, tool, model, per-item verdict with evidence). Use after implement-feature reports "ready for evaluation", and again after every fix.
---

# Evaluate Feature

You are the evaluator. You run a feature's `contract.md` item by item against the running product and record what you observe. You do not implement, fix or negotiate: you produce a verdict with evidence. A green report is a promise someone else will collect on (the brief's "Fluxo do avaliador"), so be strict.

## INDEPENDENCE (read first)

- **Fresh context only.** Run in a context that did not implement or fix this feature: a new subagent with an empty context or a separate session. If this conversation contains the implementation or a fix of this feature, stop and answer: "A avaliação precisa de um contexto novo (subagente ou outra sessão)."
- **Behavior, not claims.** The implementer's chat report, commit messages, comments and the spec's claims are not evidence. Only what you observe now, running the contract, is.
- **Read-only on the product.** Never edit code, tests, `contract.md`, `spec.md`, `plan.md`, the PRD or older reports. Your only writes are the new report (plus its evidence assets) and this feature's entry in `docs/state.json`.
- **Doubt fails.** An item that cannot be executed as written (ambiguous, environment down, surface missing) is ✗ with reason `não executável`. Never pass an item by interpretation, by reading code, or because "it would work".
- **Flaky is failing.** Retry an item only to rule out your own mistake (typo, wrong variable), recording every attempt. A genuine failure in any attempt stands.

## INPUT

Free-form:
- Feature reference: `F05`, a name, or the folder `docs/features/F05-<nome>/`.
- Optional: the commit/branch to evaluate (default: current `HEAD`).
- Optional: tool/model to record (default: detect — tool from the environment, e.g. `claude --version`; model ID from your own system information).

Locate `docs/features/<ID>-*/contract.md`. Without it, abort: "contract.md ausente em <pasta>."

## STEPS

### 1. Load (minimal context)

Read in full: `contract.md`; the text of the PRD criteria (`docs/PRD.md`) that the contract's mapping lists; `AGENTS.md` and `README.md` for commands, addresses and credentials; the brief rules those criteria cite (`docs/brief.md`).

Do NOT read `spec.md`, `plan.md` or the implementation to decide a verdict. You may read code only after an item failed, to write a useful diagnosis note — the verdict stays based on observed behavior.

### 2. Record the evaluation identity

- Date and time with timezone: `date -Iseconds`.
- Evaluated commit: `git rev-parse HEAD` (full hash) and branch: `git branch --show-current`.
- Working tree must be clean (`git status --porcelain` empty, ignoring files you will create). If not, abort: the evaluation must be of a commit.
- Contract version: `git log -1 --format=%H -- <contract.md>`.
- Tool and version, model ID, and context type (`subagente novo, contexto vazio` or `sessão nova`).

### 3. Bring the environment up from scratch

Run the down command, then the up command from `AGENTS.md`. Check every prerequisite in the contract's section 1. If the environment does not come up, every item is ✗ `não executável` and the verdict is REPROVADO — still write the report.

### 4. Run the items

For each item, in order, exactly as written:
- Execute the verification and capture evidence: the command and its relevant output (trimmed, never edited), HTTP status and body, exact page text, and for `UI` items a screenshot saved to `reports/assets/<report-stem>/<item-id>.png` when the tooling allows.
- `TEMPO` items: record the timestamps of the action and of each observation.
- Concurrency items: run every round the item asks for, each on a fresh event, and record the counts of each round.
- Verdict ✓ only when the observed result matches the expected result completely (status **and** body, exact message, every number). Anything partial is ✗.
- Mask passwords in evidence (`****`). The partner key and seed e-mails may appear.

### 5. Run the gates

Run the gates command once on the evaluated commit and record the result as check `G1`. A failing gate makes the verdict REPROVADO even if every contract item passed.

### 6. Derive the criteria

For each row of the contract's mapping (section 3): ✓ when all its items are ✓, otherwise ✗.

Verdict: **APROVADO** only when every item and `G1` are ✓. Otherwise **REPROVADO**.

### 7. Tear down

Run the down command. Confirm no container of the project is left (`docker ps`).

### 8. Write the report

Create `docs/features/<ID>-<kebab>/reports/<YYYY-MM-DD-HHMMSS>.md` using the template below. Never overwrite an existing file (if the name exists, wait a second and use the new timestamp). Write in Brazilian Portuguese; keep IDs, commands and outputs verbatim.

### 9. Update the state and commit

- In `docs/state.json`, set only this feature's entry: `"status": "concluida"` (APROVADO) or `"reprovada"` (REPROVADO), and `"ultimo_relatorio": "<path of the new report>"`.
- Stage exactly the new report, its assets and `docs/state.json`, and create one commit: `eval(F<NN>): <APROVADO|REPROVADO> — relatório <stem>`. No `git add -A`, no hook skipping.
- Never amend, rebase-edit or rewrite a commit that contains a report. If the report has a mistake, the fix is a new evaluation with a new report.

### 10. Answer in chat

Verdict, report path, the evaluated commit, and — when REPROVADO — the failed items with expected vs. observed, followed by: "Próximo passo: `/implement-feature <caminho do relatório>` (modo correção) e nova avaliação em contexto novo."

## REPORT TEMPLATE

````markdown
# Avaliação F<NN> — <Nome da feature>

| Campo | Valor |
|---|---|
| Data | <AAAA-MM-DDTHH:MM:SS±hh:mm> |
| Commit avaliado | `<hash completo>` |
| Branch | `<branch>` |
| Contrato | `docs/features/<pasta>/contract.md` @ `<hash do último commit do contrato>` |
| Ferramenta | <ferramenta e versão> — <subagente novo, contexto vazio / sessão nova> |
| Modelo | `<id do modelo>` |
| Veredito | **APROVADO** / **REPROVADO** (<n> de <m> itens aprovados; gates <ok/falhou>) |

## Ambiente

```
$ <comando de derrubar>
<saída relevante>
$ <comando de subir>
<saída relevante>
```

Pré-requisitos do contrato: <ok / o que faltou>.

## Itens

### C01 — <título do item> — ✓

**Como verifiquei:** <passos executados, exatamente como no contrato>

**Esperado:** <resultado esperado do contrato>

**Observado:**

```
$ <comando>
<saída>
```

<screenshot: `assets/<stem>/C01.png`, quando houver>

### C02 — <título do item> — ✗

**Esperado:** ...

**Observado:** ...

**Diagnóstico (opcional):** <onde parece estar o problema; não altera o veredito>

## Gates

### G1 — `<comando de gates>` — ✓

```
<resumo da saída: testes executados, falhas>
```

## Critérios do PRD

| Critério | Itens | Resultado |
|---|---|---|
| F<NN>-CA01 | C01, C02 | ✗ |
| CF<NN> (F<prov> → F<NN>) | C07 | ✓ |

## Falhas para correção

- **C02:** esperado <...>; observado <...>.

(Seção omitida quando o veredito é APROVADO.)
````

## RULES

**Always:**
- Start from a clean environment (down, then up) and a clean working tree.
- Execute every item of the contract, plus the gates — no sampling.
- Record date, evaluated commit, tool, model and context type in every report.
- Attach evidence to every verdict, pass or fail.
- Write a new report file per evaluation and commit it once, together with the state update.

**Never:**
- Evaluate a feature you implemented or fixed in this context.
- Edit code, tests, the contract, the spec, the plan, the PRD or any existing report.
- Pass an item that was not executed, was executed differently from the contract, or only partially matched.
- Use code reading, the implementer's report or test names as a substitute for runtime evidence.
- Amend, squash-edit or rewrite a commit that contains a report.
