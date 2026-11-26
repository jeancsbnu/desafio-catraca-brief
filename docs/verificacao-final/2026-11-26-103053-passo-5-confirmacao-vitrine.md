# Verificação complementar — passo 5: confirmação da compra pela vitrine em até 5 segundos

- **Data:** 2026-11-26, 10:30 (-03:00)
- **Commit da `main` avaliado:** `05d39788a2ebf76640d29585784c068de950552b` (`docs: verificação final — Fluxo do avaliador na main, aprovado 2026-11-26 09:05:13 -0300`)
- **Ferramenta:** Claude Code (subagente novo, contexto vazio)
- **Modelo:** Claude Sonnet 5.5 (`claude-sonnet-5-5`)
- **Relação com outro relatório:** complementa a ressalva do passo 5 do relatório `2026-11-26-090358-fluxo-do-avaliador.md`, onde a leitura saiu em cerca de 5,3 s porque a página foi relida com intervalo grande. Aquele relatório não foi alterado.

## Método

1. Clone limpo da `main` (`https://github.com/jeancsbnu/desafio-catraca-brief.git`) em `/tmp/catraca-passo5-<timestamp>`, com a porta 3000 livre e o volume `catraca_db-data` removido antes, tudo sob `flock -w 1800 /tmp/catraca-porta-3000.lock`. Subida com `npm run up` (saiu com 0, `/health` saudável).
2. Rotas e campos descobertos pelo HTML: `POST /cadastro` (`nome`, `email`, `senha`), `POST /entrar`, `POST /organizador/eventos` (`nome`, `inicio` DD/MM/AAAA HH:MM, `local`, `lotacao`, `preco`), `POST /organizador/eventos/{id}/publicar`, `POST /eventos/{id}/comprar` (`cartao`) e `GET /meus-ingressos`.
3. Organizador A (`organizador.a@catraca.test`) criou e publicou um evento (lotação 20, R$ 100,00, início 15/12/2026 20:00, mês seguinte).
4. Dez compras, cada uma por uma conta de participante nova criada em `/cadastro`, com o cartão `4000000000000001`, pelo mesmo caminho HTTP da vitrine (formulário `POST /eventos/{id}/comprar`, sessão por cookie). Para cada uma: instante `t0` tomado imediatamente antes de enviar o POST (relógio monotônico, ms); em seguida leituras de `GET /meus-ingressos` em sequência (a primeira logo após a resposta do POST, as demais a cada 250 ms de espera entre leituras) até a página trazer `confirmado`. O tempo pela página é o decorrido de `t0` até o fim da primeira leitura que trouxe `confirmado` (inclui a duração do próprio POST e da leitura, ou seja, é uma medida conservadora). A primeira leitura de cada compra foi classificada como `pendente` ou `confirmado`.
5. Medida no relógio do banco: `tickets.status_changed_at - tickets.created_at` de cada ingresso (consulta SQL, colunas descobertas com `\d tickets`).
6. Encerramento: `npm run down`, `docker volume rm catraca_db-data` (volume confirmado como inexistente depois) e clone apagado.

Observação: as medições foram feitas por um script Node (cliente HTTP) com a mesma sequência de requisições de um navegador, não por um navegador; o recarregamento da página corresponde a um `GET /meus-ingressos`.

## Resultados das 10 compras

| # | Primeira leitura (logo após o POST) | Primeira leitura (s desde o POST) | Confirmado pela página (s) | Leituras até confirmar | Banco: `created_at` | Banco: `status_changed_at` | Banco: diferença (s) |
|---|---|---|---|---|---|---|---|
| 1 | pendente | 0,090 | 4,203 | 17 | 10:29:39.057 | 10:29:42.981 | 3,924 |
| 2 | pendente | 0,053 | 4,229 | 17 | 10:29:43.346 | 10:29:47.330 | 3,984 |
| 3 | pendente | 0,066 | 3,902 | 15 | 10:29:47.783 | 10:29:51.574 | 3,791 |
| 4 | pendente | 0,116 | 4,215 | 17 | 10:29:51.845 | 10:29:55.928 | 4,083 |
| 5 | pendente | 0,077 | 3,206 | 13 | 10:29:56.162 | 10:29:59.246 | 3,085 |
| 6 | pendente | 0,090 | 4,013 | 16 | 10:29:59.542 | 10:30:03.236 | 3,694 |
| 7 | pendente | 0,061 | 3,272 | 13 | 10:30:03.652 | 10:30:06.793 | 3,141 |
| 8 | pendente | 0,065 | 3,493 | 14 | 10:30:07.069 | 10:30:10.322 | 3,253 |
| 9 | pendente | 0,061 | 3,009 | 12 | 10:30:10.775 | 10:30:13.529 | 2,754 |
| 10 | pendente | 0,116 | 3,704 | 14 | 10:30:13.977 | 10:30:17.315 | 3,338 |

Todas as 10 respostas do POST de compra foram `302` para `/meus-ingressos?ok=compra`; os 10 ingressos terminaram `confirmed` no banco (canal `vitrine`).

## Estatísticas

| Medida | Mínimo | Mediana | Máximo |
|---|---|---|---|
| Tempo até `confirmado` pela página (s) | 3,009 | 3,803 | 4,229 |
| Diferença no relógio do banco (s) | 2,754 | 3,516 | 4,083 |

Margem em relação ao limite de 5,0 s: 0,771 s no pior caso pela página.

## Conclusão

**APROVADO.** As 10 compras apareceram como `pendente` na primeira leitura de "Meus ingressos" e como `confirmado` em até 4,229 s pela leitura da página (limite 5,0 s), com intervalo de releitura de 250 ms. A medida no relógio do banco (máximo 4,083 s) concorda. Isso afasta a ressalva do passo 5 do relatório `2026-11-26-090358-fluxo-do-avaliador.md`, cuja leitura de cerca de 5,3 s decorreu do intervalo grande entre as releituras da página, não de demora na confirmação.
