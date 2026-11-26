# Plano de implementação: F02 — Contas e acesso

**Pré-requisitos:**
- F01 integrada à `main`: aplicação base com módulos em `app/src/features/`, layout com navegação extensível, tabela `users` com a seed, runner de migrations, `SESSION_SECRET` na configuração e infraestrutura de testes.
- Worktree própria (`feat/F02-contas-e-acesso`) com `.env` local definindo `COMPOSE_PROJECT_NAME` e `CATRACA_PORT` próprios: a F03 é implementada ao mesmo tempo em outra worktree.
- Nenhuma dependência npm nova e nenhuma variável de ambiente nova.
- Escopo de arquivos da wave paralela: só os arquivos listados na seção 2 da spec (módulos `contas`, `organizador`, `meus-ingressos`, a migration própria, o auxiliar de sessão e `app/test/f02/`), mais os acréscimos de documentação da seção 5.15. Nada da F03 e nenhum arquivo do núcleo da F01.
- Leitura obrigatória antes de começar: `spec.md` (seções 5 e 6 trazem rotas, HTML, mensagens e SQL exatos) e `contract.md` (o que o avaliador vai executar).

### Fase 1: Sessão persistida

**1. Tabela de sessões** - Criar a migration da tabela de sessões com timestamp gerado no momento, posterior à migration de contas da F01, conforme a seção 6 da spec.

**2. Cookie assinado e acesso a dados** - Implementar a leitura, a assinatura e os cabeçalhos do cookie de sessão e as operações de banco de sessões e de contas (busca para login, criação de participante, criação, leitura e remoção de sessão, limpeza de expiradas), seguindo as seções 5.1 e 6.

**3. Identificação do usuário em toda requisição** - Criar o módulo `contas` com carregamento prioritário, a informação de usuário em cada requisição e o hook que carrega a sessão a partir do cookie, descarta cookies inválidos ou expirados e marca páginas de usuários logados como não armazenáveis, sem atuar na API de parceiros nem no health (seção 5.2).

### Fase 2: Cadastro, login, saída e navegação

**4. Validação e páginas de conta** - Implementar as regras e mensagens dos formulários de cadastro e de login e o HTML das páginas `Criar conta` e `Entrar`, com erros acima do formulário e nome e e-mail repostos, nunca a senha (seções 5.3 a 5.6).

**5. Cadastro de participante** - Implementar o envio do cadastro que cria sempre uma conta de participante e já abre a sessão, tratando e-mail repetido sem diferenciar maiúsculas, inclusive em envios simultâneos (seção 5.4).

**6. Login com retorno seguro** - Implementar o login dos dois papéis com mensagem única para credenciais erradas, destino por papel e retorno à página de origem para o participante, com a validação do parâmetro de volta contra open redirect (seções 5.5, 5.6 e 5.13).

**7. Saída** - Implementar o `Sair`, que apaga a sessão no banco, limpa o cookie e volta à vitrine (seção 5.7).

**8. Navegação de conta** - Registrar a contribuição de navegação que mostra `Entrar` e `Criar conta` ao visitante e o nome, o link da área e o botão `Sair` ao usuário logado (seção 5.11).

### Fase 3: Proteções e páginas das áreas

**9. Guardas para outras features** - Implementar e publicar a API de acesso (exige organizador, exige participante com retorno à origem e opção para organizador, usuário atual, caminho de login), com as páginas de acesso negado, e o auxiliar de login para as features consumidoras (seções 4, 5.10 e 5.12).

**10. Área do organizador e checagem de origem** - Proteger automaticamente todo caminho sob `/organizador`, inclusive rotas futuras e caminhos codificados, e bloquear requisições que alteram dados vindas de outra origem, fora da API de parceiros (seção 5.2).

**11. Páginas mínimas das áreas** - Criar as páginas mínimas `Área do organizador` e `Meus ingressos` como módulos próprios, protegidos pelos guardas, prontos para a F04 e a F06 assumirem (seções 5.8 e 5.9).

### Fase 4: Documentação

**12. AGENTS.md e README** - Acrescentar ao README onde entrar e criar conta, o efeito de trocar o segredo de sessão e a decisão de sessão e acesso, e ao `AGENTS.md` a convenção de uso da API de acesso, só com os acréscimos da seção 5.15 da spec.

**13. Fechamento da implementação** - Registrar na seção 10 da spec os desvios em relação ao planejado (inclusive o nome final da migration) e marcar a F02 como `aguardando_avaliacao` no `docs/state.json`, sem tocar a entrada da F03.
