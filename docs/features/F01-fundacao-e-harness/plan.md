# Plano de implementação: F01 — Fundação e harness

**Pré-requisitos:**
- Host Linux ou WSL com Docker (Compose v2), Git e Node.js LTS (≥ 20); nenhum `npm install` na raiz.
- Imagens `node:24-bookworm-slim` e `postgres:16-alpine` (baixadas pelo próprio Compose se faltarem).
- Nenhuma variável de ambiente obrigatória; `.env` local só para mudar `CATRACA_PORT`/`COMPOSE_PROJECT_NAME` (worktree).
- Leitura obrigatória antes de começar: `spec.md` (seções 4, 5 e 6 descrevem arquivos, interfaces e mensagens exatas) e `contract.md` (o que o avaliador vai executar, num clone limpo).

### Fase 1: Aplicação base

**1. Projeto da aplicação** - Criar a pasta `app/` com manifesto próprio, dependências de runtime e de desenvolvimento, TypeScript estrito em ESM, lint em flat config e o executor de testes, conforme a seção 4 da spec. O lockfile é gerado nesta etapa e passa a ser a fonte das versões.

**2. Configuração por ambiente** - Implementar o carregamento e a validação da configuração com os padrões da seção 5.4, incluindo o modo `simulado` do gateway, a escala de atraso restrita ao ambiente de testes e a descrição da configuração com segredos mascarados.

**3. Núcleo HTTP e utilitários compartilhados** - Montar a construção da aplicação com os recursos compartilhados (configuração, banco, layout, tarefas em segundo plano), o leitor de formulários na raiz, as respostas padrão de página inexistente e de erro, o helper de template que escapa HTML, o layout com navegação extensível e os utilitários de IDs, senha e formatação (seções 5.3, 5.6 e 5.7).

**4. Carregamento de módulos e primeiros módulos** - Implementar o carregamento automático das pastas de feature com ordem determinística e erro claro para módulo inválido, e criar os módulos de saúde (que consulta o banco) e da vitrine provisória (seções 5.1, 5.2 e 5.5).

### Fase 2: Containers e comandos do host

**5. Imagem da aplicação** - Escrever a imagem multi-stage com os estágios de dependências, build, gates e runtime, o fuso do produto, usuário sem privilégios, checagem de saúde pela própria rota de saúde e o atalho da linha de comando `catraca` (seção 5.11).

**6. Ambientes Compose** - Definir o ambiente do avaliador (banco com volume nomeado e sem porta no host, aplicação com porta configurável que espera o banco saudável) e o ambiente efêmero dos gates (banco próprio em memória, nenhuma porta no host), conforme a seção 5.11.

**7. Comandos do host** - Criar o manifesto da raiz sem dependências, os scripts de subir, derrubar e rodar os gates com as mensagens e os códigos de saída da seção 5.9, o executor dos gates de dentro do container com o resumo final e os arquivos auxiliares (exemplo de `.env`, proteção dos relatórios contra formatação).

### Fase 3: Banco, migrations, seed e linha de comando

**8. Acesso ao banco** - Configurar o pool de conexões com o fuso do produto, a conversão de inteiros grandes e a espera pelo banco na subida, e o utilitário de transação que as features seguintes vão usar (seção 5.7).

**9. Runner de migrations e tabela de contas** - Implementar o runner com tabela de controle, trava consultiva, validação de nomes, verificação de integridade e uma transação por arquivo, e a primeira migration com a tabela de contas (seção 6).

**10. Seed idempotente** - Implementar a seed das três contas documentadas com upsert por e-mail, preservando identificadores e informando quantas contas foram criadas e quantas já existiam (seções 5.10 e 6).

**11. Inicialização e linha de comando** - Encadear configuração, banco, migrations, seed, módulos e escuta na inicialização, com mensagens por etapa, falha com código 1 e encerramento limpo, e criar a linha de comando com descoberta automática de comandos e os comandos de migrations, seed, configuração e ajuda (seções 5.8 e 5.10).

**12. Infraestrutura de testes compartilhada** - Preparar o banco de teste isolado com a proteção contra outro banco, a criação da aplicação para requisições simuladas, a limpeza de dados entre testes, os bancos temporários e as contas da seed para uso de todas as features (seção 7).

### Fase 4: Documentação

**13. AGENTS.md e README** - Atualizar o `AGENTS.md` com os comandos prontos, endereços, ambiente por worktree, convenções de código e o mapa dos artefatos, e criar o `README.md` com as seções do Entregável, marcando o que depende de features futuras (seção 4, Documentação).

**14. Fechamento da implementação** - Registrar na seção 10 da spec os desvios em relação ao planejado, conferir que o `CLAUDE.md` continua apontando para o `AGENTS.md` e marcar a F01 como `aguardando_avaliacao` no `docs/state.json`.
