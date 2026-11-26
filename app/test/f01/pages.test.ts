import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';

const FIXTURES_OK = fileURLToPath(new URL('../fixtures/features-ok/', import.meta.url));

describe('F01 páginas e respostas padrão', () => {
  it('F01-CA01 GET / responde a vitrine provisória dentro do layout', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.body).toContain('<html lang="pt-BR">');
    expect(response.body).toContain('data-area="navegacao"');
    expect(response.body).toContain('<title>Eventos à venda · Catraca</title>');
    expect(response.body).toContain('<h1>Eventos à venda</h1>');
    expect(response.body).toContain('Nenhum evento à venda no momento.');
  });

  it('rota inexistente responde 404 em HTML', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/nao-existe' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.body).toContain('<h1>Página não encontrada</h1>');
    expect(response.body).toContain('<html lang="pt-BR">');
  });

  it('rota inexistente sob /api/ responde 404 em JSON', async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/nao-existe' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.body).toBe('{"error":"not_found"}');
  });

  it('erro não tratado responde 500 sem detalhes internos', async () => {
    const { app } = await createTestApp({ featuresDir: FIXTURES_OK });
    const page = await app.inject({ method: 'GET', url: '/beta/erro' });
    expect(page.statusCode).toBe(500);
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.body).toContain('Algo deu errado. Tente novamente.');
    expect(page.body).not.toContain('segredo interno');
    expect(page.body).not.toContain('SELECT');

    const api = await app.inject({ method: 'GET', url: '/api/beta/erro' });
    expect(api.statusCode).toBe(500);
    expect(api.body).toBe('{"error":"internal_error"}');
  });

  it('JSON malformado responde 400 sem detalhes internos', async () => {
    const { app } = await createTestApp({ featuresDir: FIXTURES_OK });
    const page = await app.inject({
      method: 'POST',
      url: '/alfa/eco',
      headers: { 'content-type': 'application/json' },
      payload: '{"quebrado":',
    });
    expect(page.statusCode).toBe(400);
    expect(page.body).toContain('<h1>Requisição inválida</h1>');
  });

  it('formulário urlencoded é interpretado na raiz', async () => {
    const { app } = await createTestApp({ featuresDir: FIXTURES_OK });
    const response = await app.inject({
      method: 'POST',
      url: '/alfa/eco',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'nome=Ana+Maria&cidade=S%C3%A3o+Paulo',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ recebido: { nome: 'Ana Maria', cidade: 'São Paulo' } });
  });
});
