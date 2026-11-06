# Saints’ Cookies

Site de cookies artesanais, com catálogo, sacola, cadastro, login e encomendas. A identidade visual usa creme, dourado e rosa suave, com as fontes DM Sans e Playfair Display.

## Desenvolvimento — branch dev

`dev` é a antiga branch `creditos`, renomeada com o histórico preservado. As próximas alterações vão para `dev`; `preview` está em espera. O merge em `main` depende de um pedido explícito do usuário.

O sistema de pontos, brindes e resgates foi retirado. A área **Minha conta** mantém cadastro, login, dados pessoais e histórico de encomendas. O painel da equipe permite conferir pedidos e confirmar pagamentos, sem gerar créditos.

- Prévia do desenvolvimento: <https://dev.saintscookies.pages.dev/>.
- Minha conta: <https://dev.saintscookies.pages.dev/conta>.
- Site principal no Pages: <https://saintscookies.pages.dev/>.
- Guia do ambiente, banco e contas: [DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md).

O Pages usa Functions e o D1 existente `saintscookies-creditos`. O nome do banco foi mantido para preservar as contas e os pedidos cadastrados. A mudança não exige SQL novo no banco já inicializado.

## Executar

Requer Node.js 24 para os testes completos.

```sh
npm ci
npm run site:prepare
npm run site:dev
```

Abra `/conta` no endereço local indicado. `npm run dev` inicia apenas o frontend com Vite; cadastro e login precisam do servidor completo acima. A integração com a Meta está em espera, com o código preservado para uma retomada futura.

## Verificar

```sh
npm test
npm run test:account
npm run test:account:pages
npm run test:e2e
npm run build -- --base=/
```

Instale o navegador com `npx playwright install chromium`. Para usar Chromium do sistema, defina `CHROMIUM_PATH=/usr/bin/chromium`. Os testes usam um banco local descartável separado do banco de desenvolvimento.

## Publicação

A Cloudflare publica a branch `dev` como prévia do projeto Pages `saintscookies`, com o comando `npm run build -- --base=/` e pasta `dist`. O vínculo D1 `DB` é configurado pelo `wrangler.jsonc` apenas em Preview. Confira se o projeto permite builds de preview da branch `dev`.

O workflow `.github/workflows/dev.yml` verifica cadastro, login, perfil, pedidos, pagamentos e ausência das antigas funções de créditos. O workflow histórico de GitHub Pages continua separado, com `main` e `preview`; ele não recebe esta mudança em produção.

## Antes de uso comercial

Os sabores, preços e fotos do catálogo continuam de demonstração. Defina os dados oficiais, disponibilidade, local e horários de retirada e as condições de entrega/pagamento. Esta versão aceita encomendas de teste sem cobrança automática. A área de conta ainda não oferece recuperação de senha ou verificação de e-mail.
