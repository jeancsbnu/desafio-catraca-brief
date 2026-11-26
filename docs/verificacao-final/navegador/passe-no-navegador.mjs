// Passe da interface da Catraca em navegador real (Chromium via Playwright), com screenshots.
//
// Como rodar (a partir da raiz do repositório, com o produto no ar via `npm run up`):
//
//   V=$(npm view playwright version)
//   docker run --rm --network catraca_default --user "$(id -u):$(id -g)" -e HOME=/tmp \
//     -e BASE=http://produto:3000 -e API_BASE=http://app:3000 -e KEY=parceiro-catraca-dev -e OUT=/out \
//     -v "$PWD/docs/verificacao-final/navegador:/out" \
//     mcr.microsoft.com/playwright:v$V-noble \
//     bash -c "mkdir -p /tmp/pw && cd /tmp/pw && npm init -y >/dev/null && npm i playwright@$V >/dev/null \
//              && PW_MODULE=/tmp/pw/node_modules/playwright/index.mjs node /out/passe-no-navegador.mjs"
//
// Variáveis: BASE (navegador, padrão http://produto:3000), API_BASE (API, padrão http://app:3000), KEY (chave de parceiro), OUT (pasta de saída, padrão a
// pasta deste script), RUN_ID (padrão AAAA-MM-DD-HHMMSS no fuso -03:00), PW_MODULE (módulo do Playwright).
// Saída: OUT/<RUN_ID>/NN-descricao.png e, no stdout, um JSON com o resultado de cada passo.
// O produto precisa estar recém-subido (volume do banco novo); os dados levam um sufixo único.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium, request } = await import(process.env.PW_MODULE ?? 'playwright');

// O Chromium trata o host "app" como TLD .app (HSTS pré-carregado, força https); por isso o navegador
// acessa o produto como "produto" (regra --host-resolver-rules MAP produto app) e a API usa API_BASE.
const BASE = process.env.BASE ?? 'http://produto:3000';
const API_BASE = process.env.API_BASE ?? 'http://app:3000';
const KEY = process.env.KEY ?? 'parceiro-catraca-dev';
const TZ = 'America/Sao_Paulo';
const SUF = Date.now().toString(36);
const OUT_BASE = process.env.OUT ?? dirname(fileURLToPath(import.meta.url));

function partes(d) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const o = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return o;
}
const agora = partes(new Date());
const RUN_ID = process.env.RUN_ID ?? `${agora.year}-${agora.month}-${agora.day}-${agora.hour}${agora.minute}${agora.second}`;
const OUT = join(OUT_BASE, RUN_ID);
mkdirSync(OUT, { recursive: true });

function dataMesSeguinte(dia) {
  let ano = Number(agora.year);
  let mes = Number(agora.month) + 1;
  if (mes > 12) { mes = 1; ano += 1; }
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano} 20:00`;
}
function dataOntem() {
  const p = partes(new Date(Date.now() - 24 * 3600 * 1000));
  return `${p.day}/${p.month}/${p.year} 20:00`;
}

const norm = (s) => s.replace(/ /g, ' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ate(fn, ms, intervalo = 300) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return { ok: true, ms: Date.now() - t0, v };
    if (Date.now() - t0 >= ms) return { ok: false, ms: Date.now() - t0 };
    await sleep(intervalo);
  }
}

const resultados = [];
async function passo(id, descricao, fn) {
  const falhas = [];
  const obs = [];
  const shots = [];
  const s = {
    check(cond, msg) { if (!cond) falhas.push(msg); else obs.push(`ok: ${msg}`); },
    nota(msg) { obs.push(msg); },
    async texto(page, esperado, naoDeve = false) {
      const t = norm(await page.locator('body').innerText());
      const tem = t.includes(esperado);
      if (naoDeve ? tem : !tem) falhas.push(`${naoDeve ? 'não deveria conter' : 'esperado'} "${esperado}"`);
      else obs.push(`${naoDeve ? 'não contém' : 'contém'} "${esperado}"`);
    },
    async shot(page, nome) {
      const f = `${nome}.png`;
      await page.screenshot({ path: join(OUT, f), fullPage: true });
      shots.push(f);
    },
  };
  try { await fn(s); } catch (e) { falhas.push(`exceção: ${String(e.message ?? e).split('\n')[0]}`); }
  const ok = falhas.length === 0;
  resultados.push({ passo: id, descricao, ok, falhas, obs, shots });
  console.error(`[${ok ? 'ok' : 'FALHA'}] ${id} ${descricao}${ok ? '' : ' -> ' + falhas.join(' | ')}`);
}

async function enviar(page, locator) {
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), locator.click()]);
}
async function entrar(page, email, senha) {
  await page.goto(`${BASE}/entrar`);
  await page.locator('#email').fill(email);
  await page.locator('#senha').fill(senha);
  await enviar(page, page.getByRole('button', { name: 'Entrar' }));
}
async function preencherEvento(page, d) {
  await page.locator('#nome').fill(d.nome);
  await page.locator('#inicio').fill(d.inicio);
  await page.locator('#local').fill(d.local);
  await page.locator('#lotacao').fill(String(d.lotacao));
  await page.locator('#preco').fill(d.preco);
}
async function painel(page) {
  return page.evaluate(() => {
    const o = {};
    for (const e of document.querySelectorAll('[data-metrica]')) o[e.getAttribute('data-metrica')] = { texto: e.textContent.trim(), centavos: e.getAttribute('data-centavos') };
    return o;
  });
}

const browser = await chromium.launch({ headless: true, args: [`--host-resolver-rules=MAP ${new URL(BASE).hostname} ${new URL(API_BASE).hostname}`] });
const versaoChromium = browser.version();
const novoCtx = () => browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: TZ });
const api = await request.newContext({ baseURL: API_BASE, extraHTTPHeaders: { 'X-Api-Key': KEY } });
const comprarApi = async (evento, email, cartao) => {
  const r = await api.post(`/api/partner/events/${evento}/purchases`, { data: { buyerEmail: email, cardNumber: cartao } });
  return { status: r.status(), corpo: await r.json().catch(() => null), t: Date.now() };
};
const statusApi = async (tid) => (await (await api.get(`/api/partner/tickets/${tid}`)).json()).status;
const listaApi = async () => (await api.get('/api/partner/events')).json();

const ctxV = await novoCtx(); const pV = await ctxV.newPage();
const ctxA = await novoCtx(); const pA = await ctxA.newPage();
const ctxP = await novoCtx(); const pP = await ctxP.newPage();
const ctxB = await novoCtx(); const pB = await ctxB.newPage();
const ctxS = await novoCtx(); const pS = await ctxS.newPage();

const E1 = { nome: `Jazz no Porão ${SUF}`, inicio: dataMesSeguinte(15), local: 'Bar do Porão', lotacao: 2, preco: '100,00' };
let e1Id = null, e1Url = null, c1 = null, c2 = null, t2 = null, t2Hora = 0, t3 = null, t4 = null;
const emailP = `participante.${SUF}@example.com`;

await passo('1', 'Vitrine como visitante', async (s) => {
  await pV.goto(`${BASE}/`);
  await s.texto(pV, 'Eventos à venda');
  await s.shot(pV, '01-vitrine-visitante');
});

await passo('2', 'Login do organizador A (formulário) e área do organizador', async (s) => {
  await entrar(pA, 'organizador.a@catraca.test', 'catraca123');
  s.check(new URL(pA.url()).pathname === '/organizador', `URL após login é /organizador (${pA.url()})`);
  await s.texto(pA, 'Área do organizador');
  await s.shot(pA, '02-area-organizador');
});

await passo('3', 'Novo evento E1 (lotação 2, R$ 100,00) fica em Rascunho', async (s) => {
  await pA.getByRole('link', { name: 'Novo evento' }).click();
  await pA.waitForURL('**/organizador/eventos/novo');
  await preencherEvento(pA, E1);
  await enviar(pA, pA.getByRole('button', { name: 'Salvar' }));
  e1Url = new URL(pA.url()).pathname;
  e1Id = e1Url.split('/').pop();
  s.check(/^evt_/.test(e1Id), `página de gestão em ${e1Url}`);
  s.check(await pA.locator('[data-status="rascunho"]').count() === 1, 'status Rascunho na página de gestão');
  await s.texto(pA, 'Rascunho');
  await s.texto(pA, 'R$ 100,00');
  await s.shot(pA, '03-e1-rascunho');
});

await passo('4', 'Vitrine deslogada sem E1 (e listagem da API sem E1)', async (s) => {
  await pV.goto(`${BASE}/`);
  await s.texto(pV, E1.nome, true);
  s.check(!(await listaApi()).some((e) => e.id === e1Id), 'listagem da API sem E1');
  await s.shot(pV, '04-vitrine-sem-e1');
});

await passo('5', 'Criar evento com data de ontem é rejeitado', async (s) => {
  await pA.goto(`${BASE}/organizador`);
  await pA.getByRole('link', { name: 'Novo evento' }).click();
  await pA.waitForURL('**/organizador/eventos/novo');
  await preencherEvento(pA, { nome: `Evento Passado ${SUF}`, inicio: dataOntem(), local: 'Bar', lotacao: 2, preco: '100,00' });
  await enviar(pA, pA.getByRole('button', { name: 'Salvar' }));
  await s.texto(pA, 'A data de início precisa estar no futuro');
  await s.shot(pA, '05-data-passada-erro');
  await pA.goto(`${BASE}/organizador`);
  await s.texto(pA, `Evento Passado ${SUF}`, true);
});

await passo('6', 'Publicar E1: Publicado; vitrine mostra E1 com 2 vagas e R$ 100,00', async (s) => {
  await pA.goto(`${BASE}${e1Url}`);
  await enviar(pA, pA.getByRole('button', { name: 'Publicar' }));
  s.check(await pA.locator('[data-status="publicado"]').count() === 1, 'status Publicado');
  await s.texto(pA, 'Publicado');
  await s.shot(pA, '06a-e1-publicado');
  await pV.goto(`${BASE}/`);
  const linha = pV.locator(`tr[data-evento="${e1Id}"]`);
  s.check(await linha.count() === 1, 'vitrine lista E1');
  const cel = (await linha.locator('td').allInnerTexts()).map(norm);
  s.check(cel[3] === 'R$ 100,00', `preço na vitrine "${cel[3]}"`);
  s.check(cel[4] === '2', `vagas na vitrine "${cel[4]}"`);
  await s.shot(pV, '06b-vitrine-com-e1');
  const ev = (await listaApi()).find((e) => e.id === e1Id);
  s.check(ev?.availableSeats === 2 && ev?.priceCents === 10000, `API: ${JSON.stringify(ev)}`);
});

await passo('7', 'Cadastro de participante novo (formulário) fica logado', async (s) => {
  await pP.goto(`${BASE}/cadastro`);
  await pP.locator('#nome').fill(`Participante ${SUF}`);
  await pP.locator('#email').fill(emailP);
  await pP.locator('#senha').fill('senha-forte-123');
  await enviar(pP, pP.getByRole('button', { name: 'Criar conta' }));
  const nome = (await pP.locator('.nav-usuario').first().innerText().catch(() => '')).trim();
  s.check(nome === `Participante ${SUF}`, `usuário logado na navegação: "${nome}"`);
  await s.shot(pP, '07-cadastro-logado');
});

await passo('8', 'Compra de E1 na vitrine (…0001): Compra registrada, pendente, código', async (s) => {
  await pP.goto(`${BASE}/`);
  await pP.locator(`tr[data-evento="${e1Id}"]`).getByRole('link', { name: 'Comprar' }).click();
  await pP.waitForURL(`**/eventos/${e1Id}`);
  await s.texto(pP, 'Comprar ingresso');
  await s.shot(pP, '08a-evento-formulario-compra');
  await pP.locator('#cartao').fill('4000000000000001');
  await enviar(pP, pP.getByRole('button', { name: 'Comprar' }));
  s.check(new URL(pP.url()).pathname === '/meus-ingressos', `redirecionou para ${pP.url()}`);
  await s.texto(pP, 'Compra registrada');
  const linha = pP.locator('tr', { hasText: E1.nome });
  s.check((await linha.locator('td[data-status]').innerText()).trim() === 'pendente', 'status pendente');
  c1 = (await linha.locator('code').innerText()).trim();
  s.check(/^[A-Z0-9]{8}$/.test(c1), `código C1 = ${c1}`);
  await s.shot(pP, '08b-meus-ingressos-pendente');
});
const tCompraC1 = Date.now();

await passo('9', 'Recarregar até confirmado (em até 5 s)', async (s) => {
  const r = await ate(async () => {
    await pP.reload({ waitUntil: 'load' });
    const linha = pP.locator('tr', { hasText: E1.nome });
    return (await linha.locator('td[data-status]').innerText()).trim() === 'confirmado';
  }, 6000, 400);
  s.check(r.ok, `confirmado após recarregar (${Date.now() - tCompraC1} ms desde o registro da compra)`);
  s.check(Date.now() - tCompraC1 <= 5000 + 1500, `tempo total ${Date.now() - tCompraC1} ms (limite 5 s + folga de navegação de 1,5 s)`);
  await s.shot(pP, '09-meus-ingressos-confirmado');
});

await passo('10', 'Compra de E1 pela API (…0004) pendente; participante vê Ingressos esgotados', async (s) => {
  const r = await comprarApi(e1Id, 't2@example.com', '4000000000000004');
  t2Hora = r.t;
  s.check(r.status === 202 && r.corpo?.status === 'pending', `API 202 pending: ${JSON.stringify(r.corpo)}`);
  t2 = r.corpo?.ticketId; c2 = r.corpo?.code;
  const ev = (await listaApi()).find((e) => e.id === e1Id);
  s.check(ev?.availableSeats === 0, `listagem da API com availableSeats ${ev?.availableSeats}`);
  await pP.goto(`${BASE}/eventos/${e1Id}`);
  await s.texto(pP, 'Ingressos esgotados');
  await s.shot(pP, '10-evento-esgotado');
  const r2 = await comprarApi(e1Id, 'extra@example.com', '4000000000000001');
  s.check(r2.status === 409 && r2.corpo?.error === 'sold_out', `API sem vaga: ${r2.status} ${JSON.stringify(r2.corpo)}`);
  s.check(r2.t - t2Hora < 30000, `409 em ${r2.t - t2Hora} ms (< 30 s)`);
});

await passo('11', 'Organizador A tenta lotação 1 e leva erro', async (s) => {
  await pA.goto(`${BASE}${e1Url}`);
  await pA.locator('[data-secao="edicao"] #lotacao').fill('1');
  await enviar(pA, pA.getByRole('button', { name: 'Salvar alterações' }));
  await s.texto(pA, 'A lotação não pode ficar menor que as vagas ocupadas');
  await s.shot(pA, '11-lotacao-menor-erro');
});

let t3Hora = 0;
await passo('12', 'Recusa do …0004, T3, edição de preço/lotação, T4 e painel', async (s) => {
  const r = await ate(async () => (await statusApi(t2)) === 'declined', 46000 - (Date.now() - t2Hora), 1000);
  const decorrido = Date.now() - t2Hora;
  s.check(r.ok && decorrido <= 45000, `T2 declined em ${decorrido} ms desde a compra`);
  const ev = (await listaApi()).find((e) => e.id === e1Id);
  s.check(ev?.availableSeats === 1, `availableSeats ${ev?.availableSeats} após a recusa`);
  const c3 = await comprarApi(e1Id, 't3@example.com', '4000000000000001');
  t3 = c3.corpo?.ticketId; t3Hora = c3.t;
  s.check(c3.status === 202, `T3 ${c3.status}`);
  const r3 = await ate(async () => (await statusApi(t3)) === 'confirmed', 5500, 400);
  s.check(r3.ok, `T3 confirmed em ${Date.now() - t3Hora} ms`);

  await pA.goto(`${BASE}${e1Url}`);
  await pA.locator('[data-secao="edicao"] #preco').fill('150,00');
  await pA.locator('[data-secao="edicao"] #lotacao').fill('3');
  await enviar(pA, pA.getByRole('button', { name: 'Salvar alterações' }));
  const ok = await pA.locator('.msg-success').first().innerText().catch(() => '');
  s.check(ok !== '', `mensagem de sucesso: "${ok.trim()}"`);
  await s.texto(pA, 'R$ 150,00');
  s.check(norm(await pA.locator('dl').first().innerText()).includes('Lotação\n3') || norm(await pA.locator('dl').first().innerText()).includes('Lotação\t3'), 'lotação 3 exibida');
  await s.shot(pA, '12a-edicao-aceita');

  const c4 = await comprarApi(e1Id, 't4@example.com', '4000000000000001');
  t4 = c4.corpo?.ticketId;
  s.check(c4.status === 202, `T4 ${c4.status}`);
  const r4 = await ate(async () => (await statusApi(t4)) === 'confirmed', 5500, 400);
  s.check(r4.ok, `T4 confirmed em ${Date.now() - c4.t} ms`);

  await pA.goto(`${BASE}${e1Url}`);
  const p = await painel(pA);
  s.check(p.confirmados?.texto === '3', `Confirmados ${p.confirmados?.texto}`);
  s.check(p.pendentes?.texto === '0', `Pendentes ${p.pendentes?.texto}`);
  s.check(p['check-ins']?.texto === '0', `Check-ins ${p['check-ins']?.texto}`);
  s.check(p['vagas-disponiveis']?.texto === '0', `Vagas disponíveis ${p['vagas-disponiveis']?.texto}`);
  s.check(norm(p.receita?.texto ?? '') === 'R$ 350,00', `Receita ${p.receita?.texto}`);
  s.check(p.estornados?.texto === '0', `Estornados ${p.estornados?.texto}`);
  await s.shot(pA, '12b-painel-e1');
});

await passo('13', 'Check-in de E1: liberada, já utilizado, não confirmado, inválido, painel', async (s) => {
  async function checkin(codigo, esperado, nome) {
    if (await pA.locator('#codigo').count() === 0) await pA.goto(`${BASE}${e1Url}`);
    await pA.locator('#codigo').fill(codigo);
    await enviar(pA, pA.getByRole('button', { name: 'Validar' }));
    await s.texto(pA, esperado);
    await s.shot(pA, nome);
  }
  await pA.goto(`${BASE}${e1Url}`);
  await checkin(c1, 'Entrada liberada', '13a-checkin-liberada');
  await checkin(c1, 'Ingresso já utilizado', '13b-checkin-ja-utilizado');
  await checkin(c2, 'Ingresso não confirmado', '13c-checkin-nao-confirmado');
  await checkin('ZZZZZZZZ', 'Ingresso inválido para este evento', '13d-checkin-invalido');
  await pA.goto(`${BASE}${e1Url}`);
  const p = await painel(pA);
  s.check(p['check-ins']?.texto === '1', `Check-ins ${p['check-ins']?.texto}`);
  await s.shot(pA, '13e-painel-checkin-1');
});

await passo('14', 'Organizador B não vê E1 (lista e URL direta)', async (s) => {
  await entrar(pB, 'organizador.b@catraca.test', 'catraca123');
  await s.texto(pB, 'Área do organizador');
  await s.texto(pB, E1.nome, true);
  await s.shot(pB, '14a-b-area-sem-e1');
  await pB.goto(`${BASE}${e1Url}`);
  await s.texto(pB, 'Evento não encontrado');
  await s.texto(pB, E1.nome, true);
  await s.texto(pB, c1, true);
  await s.texto(pB, 'Receita', true);
  await s.shot(pB, '14b-b-url-direta-nao-encontrado');
});

await passo('15', 'Participante da seed em /organizador: Acesso negado; visitante na gestão: login', async (s) => {
  await entrar(pS, 'participante@catraca.test', 'catraca123');
  await pS.goto(`${BASE}/organizador`);
  await s.texto(pS, 'Acesso negado');
  await s.shot(pS, '15a-participante-acesso-negado');
  await ctxV.clearCookies();
  await pV.goto(`${BASE}${e1Url}`);
  s.check(new URL(pV.url()).pathname === '/entrar', `visitante redirecionado para ${pV.url()}`);
  await s.texto(pV, E1.nome, true);
  s.check(await pV.locator('#senha').count() === 1, 'tela de login exibida');
  await s.shot(pV, '15b-visitante-tela-login');
});

await passo('16', 'E3: cancelamento pela interface, check-in, painel e vitrine', async (s) => {
  const E3 = { nome: `Workshop ${SUF}`, inicio: dataMesSeguinte(16), local: 'Sala 2', lotacao: 5, preco: '50,00' };
  await pA.goto(`${BASE}/organizador`);
  await pA.getByRole('link', { name: 'Novo evento' }).click();
  await pA.waitForURL('**/organizador/eventos/novo');
  await preencherEvento(pA, E3);
  await enviar(pA, pA.getByRole('button', { name: 'Salvar' }));
  const e3Url = new URL(pA.url()).pathname;
  const e3Id = e3Url.split('/').pop();
  await enviar(pA, pA.getByRole('button', { name: 'Publicar' }));
  s.check(await pA.locator('[data-status="publicado"]').count() === 1, 'E3 publicado');
  await s.shot(pA, '16a-e3-publicado');

  const c5 = await comprarApi(e3Id, 't5@example.com', '4000000000000003');
  const c6 = await comprarApi(e3Id, 't6@example.com', '4000000000000001');
  s.check(c5.status === 202 && c6.status === 202, `T5 ${c5.status}, T6 ${c6.status}`);
  const t5 = c5.corpo?.ticketId, t6 = c6.corpo?.ticketId, codigo6 = c6.corpo?.code;
  const r6 = await ate(async () => (await statusApi(t6)) === 'confirmed', 6000, 400);
  s.check(r6.ok, `T6 confirmed em ${Date.now() - c6.t} ms`);

  await pA.goto(`${BASE}${e3Url}`);
  await enviar(pA, pA.getByRole('button', { name: 'Cancelar evento' }));
  await s.texto(pA, 'Cancelar é irreversível. Confirmar?');
  s.check(Date.now() - c5.t < 30000, `tela de confirmação a ${Date.now() - c5.t} ms da T5 (< 30 s)`);
  await s.shot(pA, '16b-cancelar-confirmacao');
  await enviar(pA, pA.getByRole('button', { name: 'Confirmar cancelamento' }));
  const tCancelou = Date.now();
  s.check(tCancelou - c5.t < 30000, `cancelado a ${tCancelou - c5.t} ms da T5 (< 30 s)`);
  s.check(await pA.locator('[data-status="cancelado"]').count() === 1, 'status Cancelado na gestão');
  await s.texto(pA, 'Cancelado');
  s.check(await pA.locator('[data-secao="edicao"]').count() === 0 && await pA.locator('form[action$="/editar"]').count() === 0, 'sem formulário de edição');
  s.check(await pA.getByRole('button', { name: 'Publicar' }).count() === 0, 'sem botão Publicar');
  await s.shot(pA, '16c-e3-cancelado');

  const r = await ate(async () => (await statusApi(t6)) === 'refunded' && (await statusApi(t5)) === 'cancelled', 10000, 500);
  s.check(r.ok, `T6 refunded e T5 cancelled em ${Date.now() - tCancelou} ms após o cancelamento`);

  if (await pA.locator('#codigo').count() === 0) await s.texto(pA, 'Evento cancelado');
  else {
    await pA.locator('#codigo').fill(codigo6);
    await enviar(pA, pA.getByRole('button', { name: 'Validar' }));
    await s.texto(pA, 'Evento cancelado');
  }
  await s.shot(pA, '16d-checkin-evento-cancelado');

  // T5 continua cancelled depois de 45 s da compra (o gateway responde aos 30-40 s)
  const resta = 45500 - (Date.now() - c5.t);
  if (resta > 0) await sleep(resta);
  s.check((await statusApi(t5)) === 'cancelled', `T5 continua cancelled aos ${Date.now() - c5.t} ms`);
  s.check((await statusApi(t6)) === 'refunded', 'T6 continua refunded');

  await pA.goto(`${BASE}${e3Url}`);
  const p = await painel(pA);
  s.check(p.confirmados?.texto === '0', `Confirmados ${p.confirmados?.texto}`);
  s.check(p.pendentes?.texto === '0', `Pendentes ${p.pendentes?.texto}`);
  s.check(p['check-ins']?.texto === '0', `Check-ins ${p['check-ins']?.texto}`);
  s.check(p['vagas-disponiveis']?.texto === '0', `Vagas disponíveis ${p['vagas-disponiveis']?.texto}`);
  s.check(norm(p.receita?.texto ?? '') === 'R$ 0,00', `Receita ${p.receita?.texto}`);
  s.check(p.estornados?.texto === '1', `Estornados ${p.estornados?.texto}`);
  await s.shot(pA, '16e-painel-e3');

  await pV.goto(`${BASE}/`);
  await s.texto(pV, E3.nome, true);
  s.check(!(await listaApi()).some((e) => e.id === e3Id), 'listagem da API sem E3');
  const rc = await comprarApi(e3Id, 'tarde@example.com', '4000000000000001');
  s.check(rc.status === 404 && rc.corpo?.error === 'event_not_available', `compra em E3 cancelado: ${rc.status} ${JSON.stringify(rc.corpo)}`);
  await s.shot(pV, '16f-vitrine-sem-e3');
});

await browser.close();
await api.dispose();
console.log(JSON.stringify({ runId: RUN_ID, base: BASE, chromium: versaoChromium, e1Id, resultados }, null, 2));
process.exit(resultados.every((r) => r.ok) ? 0 : 1);
