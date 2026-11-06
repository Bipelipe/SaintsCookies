# Desenvolvimento do site — dev

A branch `dev` substitui `creditos`, preservando seu histórico. `main` e `preview` continuam separadas. O login será a base para as próximas funcionalidades; não há saldo de pontos, brindes, resgates ou bonificação por compra.

## O que permanece

- Cadastro com nome, e-mail, senha de 12 a 128 caracteres, telefone com DDD, endereço e pagamento preferido.
- Senhas com salt e PBKDF2-SHA256; sessão de sete dias em cookie HttpOnly, SameSite Strict e Secure em HTTPS. O banco guarda somente o hash do token.
- Edição dos dados pessoais, sacola, encomenda aceita imediatamente e histórico do cliente.
- Total calculado no servidor, cópia dos itens/preços/dados no pedido e proteção contra duplicação ao repetir o mesmo fechamento.
- Painel administrativo para ver as encomendas, conferir o recebimento e confirmar o pagamento. Repetir essa confirmação não duplica registros e não gera pontos.
- Comprovante copiável; integração com WhatsApp preservada, mas sua ativação está em espera.

O cadastro mantém os mesmos usuários e senhas. O cookie histórico `saints_creditos_session` e a coluna histórica `loyalty_order_id` são detalhes de compatibilidade do banco; não existe funcionalidade ativa de fidelidade. As tabelas históricas `point_entries`, `rewards` e `redemptions` permanecem intactas, sem leituras ou escritas pela API atual. Não é necessário executar SQL para remover a fidelidade.

## Rodar localmente

```sh
npm ci
npm run site:prepare
npm run site:dev
```

`site:prepare` compila com base `/` e aplica as migrações somente ao banco local. O estado de desenvolvimento fica em `.wrangler/state`. Para Pages local, após preparar, use `npm run site:pages:dev`. Os testes usam `.wrangler/test-state`, que é descartável; não apagam o estado de desenvolvimento nem acessam o banco remoto. É possível definir `SAINTS_LOCAL_STATE` e `SAINTS_LOCAL_PORT` para os comandos locais.

## Contas administrativas

Cadastre a conta primeiro. Para promover uma conta local já cadastrada:

```sh
npm run site:admin -- --email voce@exemplo.com --local
```

No D1 remoto, o proprietário pode executar pelo Console:

```sql
UPDATE users SET role='admin' WHERE email='email-da-conta-ja-cadastrada';
```

Substitua o e-mail e entre novamente no site. O cadastro público sempre cria clientes e não permite escolher o papel de administrador. Não existe senha administrativa padrão.

## Banco remoto existente

- Pages: `saintscookies`.
- Preview: `dev`.
- Binding: `DB`.
- D1 mantido: `saintscookies-creditos`.
- Database ID: `0e7de326-abe6-4f13-921f-6d2d1d107d47` (identificador público, não uma credencial).

A remoção do sistema de pontos não renomeia, não recria e não limpa o banco. A prévia reutiliza os mesmos registros. `wrangler.jsonc` mantém o vínculo apenas em Preview. A versão principal não recebe esse banco de teste.

Para uma instalação nova, execute [D1-INICIAL.sql](D1-INICIAL.sql). Para um banco antigo que tenha apenas a migração 0001, execute [D1-ATUALIZACAO-0002.sql](D1-ATUALIZACAO-0002.sql). Os arquivos não têm comentários de linha e podem ser colados no campo do Console mesmo que ele remova quebras de linha. São repetíveis e preservam registros existentes. Os nomes das migrações antigas foram conservados para compatibilidade com `d1_migrations`.

A API `/api/health` verifica o banco, e `/api/checkout/config` informa `ready` e `whatsapp_enabled` sem expor credenciais. Os antigos endpoints de pontos, resgate e confirmação que liberava pontos foram removidos. `/api/account` agora retorna apenas usuário, perfil e encomendas.

## Publicação

O push em `dev` executa o workflow de testes e deve gerar a prévia <https://dev.saintscookies.pages.dev/>. Build: `npm run build -- --base=/`; saída: `dist`. No projeto Pages, permita a branch `dev` nos controles de preview caso exista uma lista restrita de branches. O nome do projeto Pages continua `saintscookies`; renomear a branch não cria outro projeto.

A área pessoal fica em `/conta`. No domínio novo, `/creditos` e `/creditos.html` redirecionam para `/conta`, inclusive preservando o parâmetro de checkout. Um endereço de deployment antigo da branch anterior pode continuar apontando para um build histórico da Cloudflare; use a URL de `dev` para revisar as mudanças atuais.

Há uma configuração alternativa de Worker em `wrangler.dev.json`, com os comandos `site:build` e `site:deploy`. Esse deploy é exclusivo de `dev`, depende de credenciais Cloudflare e pode aplicar migrações remotas; não faz parte dos testes nem do fluxo atual do Pages.

## Testes

`npm test` verifica senhas, sessão, perfil, preços, transações, SQL de instalação/upgrade e mensagens simuladas. `npm run test:account` e `npm run test:account:pages` exercitam autenticação, edição de perfil, isolamento das contas, pedidos concorrentes, conferência de pagamento sem créditos e desativação dos endpoints antigos. `npm run test:e2e` verifica o catálogo e a sacola. A GitHub Action não usa credenciais de produção nem envia WhatsApp real.
