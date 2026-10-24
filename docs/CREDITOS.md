# Créditos — teste de fidelidade

Esta implementação vive apenas na branch `creditos`. O destino escolhido agora é a **prévia do Pages `saintscookies`**, com **Pages Functions** para a API e o banco D1 **saintscookies-creditos**. A opção de Worker separado também continua disponível. GitHub Pages não executa essa API. Não fazer merge em `main` ou `preview` sem autorização.

## O que já funciona

- Cadastro e login com senha de pelo menos 12 caracteres; senhas com salt e hash PBKDF2-SHA256 (100.000 iterações, limite do Web Crypto no Workers).
- Sessões de sete dias em cookie HttpOnly, SameSite=Strict e Secure em HTTPS. O banco guarda somente o hash do token da sessão.
- Cliente registra uma compra para conferência. Isso **não credita pontos** nem processa pagamentos.
- Administrador confere o valor e informa uma referência única de venda/comprovante.
- Cada real inteiro confirmado vale um ponto: R$ 50,99 gera 50 pontos.
- Histórico de pontos e compras por cliente, saldo, estoque de brindes e resgates.
- Resgates descontam pontos e reservam estoque em uma transação. Administrador registra a entrega depois.
- Repetir uma confirmação ou reenviar a mesma solicitação não duplica créditos/resgates. Uma referência de venda confirmada não pode ser usada em outra compra.

São brindes e pontos demonstrativos. Não há pagamento, envio, recuperação de senha por e-mail, verificação de e-mail, cancelamento de compra já confirmada ou edição de brindes pelo painel nesta versão. O painel é atualizado pelo botão de atualizar; não há notificação automática de novos pedidos.

## Rodar na máquina de desenvolvimento

Node 24, com dependências instaladas:

```sh
npm ci
npm run credits:prepare
npm run credits:dev
```

O primeiro comando de preparação compila os dois HTMLs com a base `/` e aplica a migração **local**, sem credenciais Cloudflare. O servidor imprime o endereço local. Abra `creditos.html` nesse servidor ou use o atalho de pontos do cabeçalho da loja.

O banco persistente local fica em `.wrangler/state`. Os testes usam outro banco, descartável, em `.wrangler/test-state`, e outra porta. Não se deve commitar nenhum desses diretórios.

Depois de cadastrar uma conta no navegador, torne-a administradora local:

```sh
npm run credits:admin -- --email SEU_EMAIL_CADASTRADO --local
```

Atualize a página/entre novamente. Cadastro pela API nunca permite escolher o papel de administrador.

## Criar o D1 remoto pelo painel

1. Cloudflare → **Storage & databases → D1 → Create database**.
2. Nome: **saintscookies-creditos**.
3. Copie o **Database ID**. Esse UUID identifica o banco; não é senha ou token.
4. Para o Pages, siga a inicialização no Console abaixo. Na opção alternativa de Worker separado, o script de deploy aplica a migração automaticamente.

O banco criado pelo usuário tem ID `0e7de326-abe6-4f13-921f-6d2d1d107d47`, registrado em `wrangler.creditos.json`. O UUID não é uma credencial. Os comandos com `--local` continuam usando exclusivamente o emulador local, mesmo com esse ID.

A configuração remota é gerada em `wrangler.creditos.remote.json`, ignorada pelo Git. A variável opcional `D1_DATABASE_ID` pode substituir o ID configurado se for necessário usar outro banco de testes. IDs ausentes ou de demonstração são recusados.

## Usar o Pages já publicado — opção escolhida

O projeto existente é `saintscookies`. A produção continua na branch `main`; a versão de testes fica na branch `creditos`.

- Endereço estável de testes: `https://creditos.saintscookies.pages.dev/creditos`.
- Endereços que começam por um hash, como `65e39191.saintscookies.pages.dev`, são publicações específicas. Use o alias da branch para acompanhar os próximos commits.
- Build command: `npm run build -- --base=/`.
- Build output directory: `dist`.
- Root directory: vazio.
- `NODE_VERSION=24`.

O diretório `functions/api/` é compilado automaticamente pelo Pages, junto do site. A API usa a mesma implementação já testada no Worker. `public/_routes.json` limita a execução das Functions a `/api/*`; os demais arquivos continuam estáticos. Não use `credits:deploy` como comando de build do Pages.

### 1. Conectar o banco apenas à prévia

Cloudflare → **Workers & Pages → saintscookies → Settings → Bindings**. Selecione o ambiente **Preview**, adicione **D1 database binding** e preencha:

| Campo | Valor |
| --- | --- |
| Variable name | `DB` (maiúsculas) |
| D1 database | `saintscookies-creditos` |
| Database ID esperado | `0e7de326-abe6-4f13-921f-6d2d1d107d47` |

Essa configuração é feita no painel e não substitui os vínculos do projeto por um arquivo Wrangler genérico. Não adicione o banco de testes ao ambiente Production.

### 2. Inicializar as tabelas no Console D1

Cloudflare → **D1 → saintscookies-creditos → Console**. Copie e execute todo o conteúdo de [`CREDITOS-D1-INICIAL.sql`](CREDITOS-D1-INICIAL.sql).

O arquivo cria as tabelas, os três brindes de demonstração e o histórico da primeira migração. Pode ser executado novamente: usa `IF NOT EXISTS`/`INSERT OR IGNORE`, sem apagar clientes, alterar seus pontos ou restaurar o estoque já consumido.

Esse SQL é gerado a partir da primeira migração por `npm run credits:sql`. Não edite o arquivo gerado isoladamente. Novas alterações de schema devem usar novas migrações.

### 3. Refazer o deploy da prévia

Salve o binding e faça **Retry deployment** da branch `creditos` no projeto Pages, pois o vínculo do banco só é aplicado a um novo deploy. Não refaça o deploy da produção para testar essa feature.

Verifique `https://creditos.saintscookies.pages.dev/api/health`. O resultado esperado é JSON com `status: ok` e `environment: test`.

- HTML nessa rota: essa publicação ainda não possui as Functions.
- Erro informando banco não conectado: o binding `DB` ainda não foi aplicado ao Preview/redeploy.
- Erro após conectar o banco: confira a execução do SQL inicial e os logs da Function.

Depois, abra `/creditos`, cadastre sua conta e use a seção **Criar o administrador no banco remoto** abaixo.

### Testar o Pages localmente

```sh
npm run credits:prepare
npm run credits:pages:dev
npm run test:creditos:pages
```

O teste de Pages inicializa um banco descartável usando exatamente o SQL do Console. Ele exercita o mesmo cadastro, confirmação, resgate e proteção de permissões do Worker.

## Alternativa: publicar no Worker separado

Cloudflare → **Workers & Pages → Create application → conexão com GitHub**. Use:

| Campo | Valor |
| --- | --- |
| Repositório | `Bipelipe/SaintsCookies` |
| Nome do Worker | `saintscookies-creditos` |
| Branch de produção deste Worker de testes | `creditos` |
| Build command | `npm run credits:build` |
| Deploy command | `npm run credits:deploy` |
| Root directory | Vazio |
| Variável de build `NODE_VERSION` | `24` |
| Variável de build `D1_DATABASE_ID` | Opcional: o ID do banco já está configurado no repositório |

Desative preview builds **neste Worker de testes**: a própria branch `creditos` já é o ambiente separado. Não altere o Worker principal, as branches `main`/`preview`, nem as configurações do GitHub Pages.

O token de build da Cloudflare precisa autorizar **Workers Scripts: Edit** e **D1: Edit** na conta correta, pois o deploy aplica as migrações e publica o binding. Configure esse token no próprio painel Cloudflare; nunca envie o valor em chat ou no código. Se o painel criou um token automático sem acesso ao D1, selecione um token com essas permissões em **Settings → Build → API token**.

O deploy só aceita a branch `creditos`, aplica migrações do D1 remoto e publica o Worker com o binding **DB**. O histórico de migrações torna essa etapa repetível. O script não cria usuários/admins, não apaga registros e não zera estoque.

Após o deploy:

- A loja abre no endereço `workers.dev` fornecido pela Cloudflare.
- A área do clube é `/creditos.html` no mesmo endereço.
- `/api/health` deve responder com `{"status":"ok","environment":"test"}`. Isso demonstra que as tabelas estão acessíveis.

## Criar o administrador no banco remoto

1. Cadastre sua conta em `/creditos` na prévia do Pages (ou `/creditos.html` na alternativa de Worker de testes).
2. Cloudflare → **D1 → saintscookies-creditos → Console**.
3. Execute, substituindo pelo e-mail exato da conta cadastrada:

```sql
UPDATE users SET role = 'admin' WHERE email = 'SEU_EMAIL_CADASTRADO';
```

4. Saia e entre novamente. O painel **Conferir e cuidar** aparece na mesma página.

Nenhuma senha padrão ou conta administrativa pública é criada. Para login, use a senha escolhida no cadastro.

## Roteiro de teste

1. Cadastre um cliente e registre uma compra de R$ 50,99. Saldo continua zero.
2. Em outra sessão de navegador, entre como administrador.
3. Confira a compra e confirme R$ 50,99 com uma referência única (ex.: `teste-venda-001`).
4. Cliente clica em **Atualizar meu saldo**: saldo de 50 pontos.
5. Cliente resgata o cookie de 50 pontos: saldo zero, brinde aguardando entrega.
6. Administrador marca o brinde como entregue.

## Verificação automatizada

```sh
npm test
npm run test:e2e
npm run test:creditos
```

Para usar o Chromium do ambiente: `CHROMIUM_PATH=/usr/bin/chromium npm run test:creditos`. Fora desse ambiente, instale o navegador com `npx playwright install chromium`.

O workflow `Test creditos` testa o banco local e o fluxo completo em **Worker e Pages Functions**, mas **não inicializa o banco da conta Cloudflare**. A integração Git do Pages publica automaticamente a branch; o binding e a inicialização do D1 remoto precisam ser configurados conforme acima. Não declarar o banco remoto pronto apenas porque os testes locais passaram.
