# Verificação final: Fluxo do avaliador contra a `main`

- **Data:** 2026-11-26, 08:51 a 09:04 (-03:00)
- **Commit da `main` avaliado:** `890e4346288bd718fc0dd52f57f99c2f6f08b8d1` (clone limpo de `https://github.com/jeancsbnu/desafio-catraca-brief.git`, branch `main`, pasta vazia em `/tmp/catraca-fluxo-<timestamp>`)
- **Ferramenta:** Claude Code, subagente novo, contexto vazio. **Modelo:** Sonnet 5.5 (`claude-sonnet-5-5`)
- **Ambiente:** WSL2 (kernel 6.6.87.2), Ubuntu 26.04.1 LTS, Docker 29.1.5 com Compose v5.0.1 (Docker Desktop), Node v26.13.1 no host
- **Método:** só README e brief (Fluxo do avaliador, Critérios de aceite, Dicas finais); sem ler specs, contratos ou código. Os passos de interface foram feitos por HTTP com `curl` e cookie jar, enviando os mesmos formulários das páginas (rotas e campos descobertos pelo HTML). Tudo sob `flock` em `/tmp/catraca-porta-3000.lock`. Antes: nenhum container ou volume `catraca*` (o volume `catraca_db-data` não existia).
- Valores: `$WEB=$API=http://localhost:3000`, `$KEY=parceiro-catraca-dev`.

## Resultado por passo

| # | Veredito | Evidência resumida |
|---|---|---|
| 1 | ✓ | `npm run up` saiu com 0 em cerca de 50 s ("Catraca no ar"); `GET /health` = `{"status":"ok"}`; containers `catraca-app-1` e `catraca-db-1` healthy; login das 3 contas da seed funciona. |
| 2 | ✓ | A criou E1 (lotação 2, R$ 100,00, 26/12/2026 20:00) e ficou Rascunho. Vitrine sem E1 (0 ocorrências); API `GET /api/partner/events` = `[]`. |
| 3 | ✓ | Criar evento em 25/11/2026: HTTP 422, "A data de início precisa estar no futuro"; não aparece na lista. |
| 4 | ✓ | Publicado (302 `?ok=publicado`). Vitrine lista E1; API: `{"id":"evt_hrnvb92l41zfv87r","name":"E1",...,"priceCents":10000,"availableSeats":2}`. `$E1=evt_hrnvb92l41zfv87r`. |
| 5 | ✓ | Cadastro novo pela interface (`/cadastro`) e compra com `4000000000000001` na vitrine. Em "Meus ingressos" saiu `pendente` logo após a compra e `confirmado` na releitura seguinte. C1=`UTSL5WPC`. Observação: essa releitura foi feita cerca de 5,3 s depois da compra, então a janela de 5 s não foi medida com precisão neste passo; as compras T3, T4 e a rajada E9, medidas por polling a cada 0,2 a 0,25 s, confirmaram em 3,2 s, 4,3 s e 3,1 s. |
| 6 | ✓ | POST com `4000000000000004`: HTTP 202 `{"ticketId":"tkt_1ahv1mxnwkuvzhoq","code":"AIMN3WQK","status":"pending"}` (T2, C2=`AIMN3WQK`), às 08:54:08. Listagem passou a `availableSeats":0`. |
| 7 | ✓ | Cerca de 0,2 s depois: compra com `...0001` = HTTP 409 `{"error":"sold_out"}`; a página do evento para o participante do passo 5 mostra `Ingressos esgotados`. |
| 8 | ✓ | Aos 52 s: T2 `declined`; E1 `availableSeats":1`. Compra T3 com `...0001` (`tkt_d781dz6nhjm0s9zy`) confirmada 3,2 s depois. |
| 9 | ✓ | Reduzir lotação para 1: 422, "A lotação não pode ficar menor que as vagas ocupadas". Preço R$ 150,00 e lotação 3: aceito (302 `?ok=atualizado`; API `priceCents":15000`). T4 confirmada em 4,3 s. Painel de E1: Confirmados 3, Pendentes 0, Check-ins 0, Vagas disponíveis 0, Receita R$ 350,00 (`data-centavos=35000`), Estornados 0. |
| 10 | ✓ | C1 `Entrada liberada`; C1 de novo `Ingresso já utilizado`; C2 `Ingresso não confirmado`; `ZZZZZZZZ` `Ingresso inválido para este evento`. Painel: Check-ins 1. Endereço de gestão: `/organizador/eventos/evt_hrnvb92l41zfv87r`. |
| 11 | ✓ | B: lista vazia ("Você ainda não tem eventos"); endereço direto = HTTP 404 "Evento não encontrado", sem nenhum dado de E1 (nome, local, códigos, números: 0 ocorrências). B criou e publicou E2 (lotação 1, R$ 20,00; `evt_do22wvyp31h4ul8t`) e comprou pela API com `...0001` (HTTP 202, C3=`UVRRLE85`). Participante da seed: HTTP 403 "Acesso negado", sem dados de E1. Visitante: 302 para `/entrar`, sem dados. A, C3 no check-in de E1: `Ingresso inválido para este evento`. |
| 12 | ✓ | A criou e publicou E3 (lotação 5, R$ 50,00; `evt_6rk36mr37vw3vyhr`), abriu a gestão, comprou T5 `...0003` (`tkt_2uap4upjuk7en6y3`, 08:55:43) e T6 `...0001` (`tkt_hvtiqvqui1y9eppf`, C6=`XUGTM3IO`). T6 `confirmed` em cerca de 4 s; E3 cancelado às 08:55:53 (10 s após T5), pela tela "Cancelar evento" e "Confirmar cancelamento". |
| 13 | ✓ | E3 fora da vitrine (0) e da API (0). Compra em E3: HTTP 404 `{"error":"event_not_available"}`. Em cerca de 0,1 s: T6 `refunded` e T5 `cancelled`. Página de gestão sem formulário de edição; POST direto em `/editar`: HTTP 409 "Este evento foi cancelado e não pode mais ser alterado". |
| 14 | ✓ | Cerca de 51 s depois da compra de T5: T5 continua `cancelled`. Check-in de E3 com C6: `Evento cancelado`. Painel de E3: Confirmados 0, Pendentes 0, Check-ins 0, Vagas disponíveis 0, Receita R$ 0,00, Estornados 1. |
| 15 | ✓ | Rajada `xargs -P 30` exatamente como no brief em E4 e E5 e em mais 4 eventos novos: todas com 5 x `202` e 25 x `409`; painel Confirmados 5 e Vagas disponíveis 0 (ver tabela de rajadas). |
| 16 | ✓ | As 3 rotas sem cabeçalho e com chave errada: HTTP 401 `{"error":"unauthorized"}` (6 de 6). `cardNumber":"123"`: HTTP 422 `invalid_request`. Ticket inexistente: HTTP 404 `ticket_not_found`. |
| 17 | ✓ | `npm run gates`: exit 0, lint ok, typecheck ok, testes ok (83 arquivos, 452 testes, 0 falhas), "resultado: OK" (cerca de 3 min). `npm run down`: exit 0; `GET :3000/health` HTTP 000 (porta fechada); `docker ps` e `docker ps -a` sem nenhum container `catraca*`. `npm run up` de novo: exit 0, sem erro; login de organizador A, B e participante (senha `catraca123`) = 302 de sucesso; dados (E1, E2, E4...) preservados com o volume. |

O passo 18 (conferência documental) não fazia parte deste escopo.

## Rajadas do passo 15

Comando: `seq 30 | xargs -P 30 -I{} curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/api/partner/events/$E/purchases" -H "X-Api-Key: $KEY" -H "Content-Type: application/json" -d '{"buyerEmail":"carga{}@example.com","cardNumber":"4000000000000001"}' | sort | uniq -c`, em eventos novos (lotação 5, R$ 10,00), criados e publicados pela interface como A.

| Evento | id | 202 | 409 | Painel após a rajada | `availableSeats` na API |
|---|---|---|---|---|---|
| E4 | `evt_2n2iwg0kcyr75zhp` | 5 | 25 | Confirmados 5, Pendentes 0, Vagas 0, Receita R$ 50,00 | 0 |
| E5 | `evt_xhh5pmwxvy47dtgq` | 5 | 25 | idem | 0 |
| E6 (repetição) | `evt_o6dt50llnctvx4bd` | 5 | 25 | idem | 0 |
| E7 (repetição) | `evt_mqj19titu4uobdh6` | 5 | 25 | idem | 0 |
| E8 (repetição) | `evt_hqoaw9lcfmwetp52` | 5 | 25 | idem | 0 |
| E9 (repetição, com cronômetro) | criado no script | 5 | 25 | Confirmados 5 em 3,07 s após a rajada | 0 |

Total: 6 rajadas, todas com exatamente 5 respostas `202` e 25 `409`, sem variação. Nas rajadas E4 a E8, o painel lido ao fim do script já mostrava Confirmados 5 e Vagas 0; o tempo preciso (até 10 s) foi cronometrado só em E9 (3,07 s).

## Limpeza

`npm run down` no clone, `docker volume rm catraca_db-data` (removido), clone apagado, nenhum container `catraca*` restante. Nada commitado.

## Conclusão

**APROVADO.** Todos os passos 1 a 17 passaram na `main` no commit `890e4346288bd718fc0dd52f57f99c2f6f08b8d1`, a partir de clone limpo, sem nenhuma falha. Ressalva de método: no passo 5 a confirmação foi lida cerca de 5,3 s depois da compra (sem polling fino); a janela de 5 s foi comprovada nas demais compras (3,1 a 4,3 s).
