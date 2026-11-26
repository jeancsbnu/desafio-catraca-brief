# Passe da interface no navegador (Chromium/Playwright)

- **Data:** 2026-11-26, execução de 10:56:31 a 10:58 (fuso -03:00)
- **Commit da `main` avaliado:** `ef42693ebee4ec5d4882c420e979b207ab9d8fcc` (clone limpo de `https://github.com/jeancsbnu/desafio-catraca-brief.git`, `npm run up` com volume `catraca_db-data` novo)
- **Ferramenta:** Claude Code (subagente novo, contexto vazio)
- **Modelo:** Claude Sonnet 5.5 (`claude-sonnet-5-5`)
- **Navegador:** Chromium 159.0.8154.6 (headless, viewport 1280×900, `fullPage: true`), Playwright 1.65.1, imagem `mcr.microsoft.com/playwright:v1.65.1-noble`
- **Script:** [`navegador/passe-no-navegador.mjs`](navegador/passe-no-navegador.mjs) (o cabeçalho diz como rodar)

## Método

O produto subiu de um clone limpo da `main`. O navegador rodou num container da imagem oficial do Playwright, na rede do Compose do produto (`catraca_default`), como o usuário do host (`--user`), com o pacote `playwright@1.65.1` instalado dentro do container, em `/tmp`, fora do repositório. O script usa interação real (`fill`, `click`, navegação por links e botões, recarregamentos) em cinco contextos de navegador separados (visitante, organizador A, participante novo, organizador B, participante da seed). Os textos de botões, rótulos e rotas vieram do HTML servido pelo produto. Cada passo confere o texto esperado na página (substring exata, sem normalizar, para as mensagens do brief; só o espaço não separável é normalizado nos valores em R$) e registra ok ou FALHA, continuando se algo falhar. As compras de terceiros "pela API" (passos 10, 12 e 16) foram feitas pelo `request` do Playwright com `X-Api-Key`. Dados com sufixo único (`mwxm8t4e`).

Observação de ambiente: o Chromium trata o host `app` como o TLD `.app` (HSTS pré-carregado) e força https, dando `ERR_SSL_PROTOCOL_ERROR`. Por isso o navegador acessa o produto como `http://produto:3000`, mapeado para `app` com `--host-resolver-rules`; a API usa `http://app:3000`. Isso afeta só a ferramenta, não o produto. Uma tentativa anterior com `app:3000` falhou por esse motivo, antes de qualquer interação, e não gerou dados nem evidência; a execução avaliada é a única que gerou os screenshots.

## Resultado por passo

Numeração do roteiro desta verificação (não é a numeração do Fluxo do avaliador do brief).

| Passo | Descrição | Resultado | Screenshots |
|---|---|---|---|
| 1 | Vitrine como visitante (`Eventos à venda`) | ok | [01](navegador/2026-11-26-105631/01-vitrine-visitante.png) |
| 2 | Login do organizador A pelo formulário; vai para `/organizador` (`Área do organizador`) | ok | [02](navegador/2026-11-26-105631/02-area-organizador.png) |
| 3 | Novo evento E1 (lotação 2, R$ 100,00, 15 do mês seguinte); página de gestão em Rascunho | ok | [03](navegador/2026-11-26-105631/03-e1-rascunho.png) |
| 4 | Vitrine deslogada sem E1 (e listagem da API sem E1) | ok | [04](navegador/2026-11-26-105631/04-vitrine-sem-e1.png) |
| 5 | Criar evento com data de ontem: `A data de início precisa estar no futuro`; evento não aparece na lista | ok | [05](navegador/2026-11-26-105631/05-data-passada-erro.png) |
| 6 | Publicar E1: Publicado; vitrine com E1, 2 vagas e `R$ 100,00`; API com `availableSeats` 2 e `priceCents` 10000 | ok | [06a](navegador/2026-11-26-105631/06a-e1-publicado.png), [06b](navegador/2026-11-26-105631/06b-vitrine-com-e1.png) |
| 7 | Cadastro de participante novo pelo formulário; fica logado (nome na navegação) | ok | [07](navegador/2026-11-26-105631/07-cadastro-logado.png) |
| 8 | Vitrine → Comprar → formulário de compra; compra com `4000000000000001`: `Compra registrada`, `pendente`, código C1 (`N8FSR5MX`) | ok | [08a](navegador/2026-11-26-105631/08a-evento-formulario-compra.png), [08b](navegador/2026-11-26-105631/08b-meus-ingressos-pendente.png) |
| 9 | Recarregar até `confirmado`: confirmado 3,2 s depois do registro da compra (limite 5 s) | ok | [09](navegador/2026-11-26-105631/09-meus-ingressos-confirmado.png) |
| 10 | Compra pela API com `…0004`: 202 `pending`, `availableSeats` 0; página do evento para o participante mostra `Ingressos esgotados`; compra pela API com `…0001` responde 409 `sold_out` (136 ms) | ok | [10](navegador/2026-11-26-105631/10-evento-esgotado.png) |
| 11 | Organizador A tenta lotação 1: `A lotação não pode ficar menor que as vagas ocupadas` | ok | [11](navegador/2026-11-26-105631/11-lotacao-menor-erro.png) |
| 12 | `…0004` recusado 37,6 s depois da compra e `availableSeats` 1; T3 (`…0001`) confirmado em 2,4 s; edição para R$ 150,00 e lotação 3 aceita (`Evento atualizado`); T4 confirmado em 2,8 s; painel: Confirmados 3, Pendentes 0, Check-ins 0, Vagas disponíveis 0, Receita `R$ 350,00`, Estornados 0 | ok | [12a](navegador/2026-11-26-105631/12a-edicao-aceita.png), [12b](navegador/2026-11-26-105631/12b-painel-e1.png) |
| 13 | Check-in: C1 `Entrada liberada`; C1 de novo `Ingresso já utilizado`; código do `…0004` `Ingresso não confirmado`; `ZZZZZZZZ` `Ingresso inválido para este evento`; painel com Check-ins 1 | ok | [13a](navegador/2026-11-26-105631/13a-checkin-liberada.png), [13b](navegador/2026-11-26-105631/13b-checkin-ja-utilizado.png), [13c](navegador/2026-11-26-105631/13c-checkin-nao-confirmado.png), [13d](navegador/2026-11-26-105631/13d-checkin-invalido.png), [13e](navegador/2026-11-26-105631/13e-painel-checkin-1.png) |
| 14 | Organizador B: área sem E1; URL direta da gestão de E1: `Evento não encontrado`, sem nome, código nem painel de E1 | ok | [14a](navegador/2026-11-26-105631/14a-b-area-sem-e1.png), [14b](navegador/2026-11-26-105631/14b-b-url-direta-nao-encontrado.png) |
| 15 | Participante da seed em `/organizador`: `Acesso negado`; visitante na URL de gestão de E1: redirecionado para a tela de login, sem dados de E1 | ok | [15a](navegador/2026-11-26-105631/15a-participante-acesso-negado.png), [15b](navegador/2026-11-26-105631/15b-visitante-tela-login.png) |
| 16 | E3 (lotação 5, R$ 50,00) publicado; T5 (`…0003`) e T6 (`…0001`) pela API; T6 confirmado em 4,0 s; cancelamento pela interface 4,2 s depois da T5 (tela `Cancelar é irreversível. Confirmar?`); página em Cancelado, sem edição nem Publicar; T6 `refunded` e T5 `cancelled` em 117 ms; check-in do código de T6: `Evento cancelado`; T5 continua `cancelled` aos 45,5 s; painel de E3: Confirmados 0, Pendentes 0, Check-ins 0, Vagas 0, Receita `R$ 0,00`, Estornados 1; vitrine e API sem E3; compra de E3 pela API responde 404 `event_not_available` | ok | [16a](navegador/2026-11-26-105631/16a-e3-publicado.png), [16b](navegador/2026-11-26-105631/16b-cancelar-confirmacao.png), [16c](navegador/2026-11-26-105631/16c-e3-cancelado.png), [16d](navegador/2026-11-26-105631/16d-checkin-evento-cancelado.png), [16e](navegador/2026-11-26-105631/16e-painel-e3.png), [16f](navegador/2026-11-26-105631/16f-vitrine-sem-e3.png) |

Total: 16 passos, 16 ok, 0 FALHA; 30 screenshots (PNG), cerca de 1,7 MB.

## Conclusão

**APROVADO.** Todos os 16 passos do roteiro passaram no navegador real contra a `main` no commit `ef42693`, com as mensagens do brief conferidas byte a byte (`Ingressos esgotados`, `Entrada liberada`, `Ingresso já utilizado`, `Ingresso não confirmado`, `Ingresso inválido para este evento`, `Evento cancelado`, `Evento não encontrado`, `Acesso negado`, `A lotação não pode ficar menor que as vagas ocupadas`) e os números do painel batendo com o estado dos ingressos.
