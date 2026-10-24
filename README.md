# Saints’ Cookies

Frontend responsivo de catálogo de cookies artesanais, com identidade em creme, dourado e rosa suave inspirada no Instagram da marca.

## Executar

Requer Node.js 20.19+ ou 22.12+ (validado com Node 24).

```sh
npm ci
npm run dev
```

## Verificar e gerar a versão de produção

```sh
npm test
npm run build
npm run preview
```

Os arquivos de produção ficam em `dist/` e podem ser publicados em hospedagem de sites estáticos, sem backend ou credenciais.

## Publicação no GitHub Pages

O workflow `.github/workflows/deploy.yml` testa, compila e publica automaticamente a cada push em `main` ou `preview`. No GitHub, configure **Settings → Pages → Build and deployment → Source → GitHub Actions**.

- Site principal, sempre compilado de `main`: `https://bipelipe.github.io/SaintsCookies/`.
- Prévia, sempre compilada de `preview`: `https://bipelipe.github.io/SaintsCookies/preview/`.

O GitHub Pages publica um único artefato por repositório. Por isso, o workflow reúne os dois builds, cada um em seu diretório, sem incorporar o código da prévia ao site principal.

O ambiente de implantação `github-pages` precisa permitir as branches `main` e `preview`. Se houver restrições de branches, um administrador pode incluir `preview` em **Settings → Environments → github-pages → Deployment branches and tags**, preservando as regras existentes. Não são necessários novos tokens ou secrets.

Enquanto este workflow existir apenas em `preview`, para uma execução manual em **Actions → Publish Saints Cookies → Run workflow**, escolha a branch `preview`. A configuração antiga em `main` só publica o site principal.

## Fluxo de revisão

Todas as próximas alterações devem ser feitas e enviadas à branch `preview`. O merge em `main` só deve ser feito com um comando explícito do usuário. A regra está registrada em `AGENTS.md`.

Para testar o build da prévia localmente:

```sh
npm run build -- --base=/SaintsCookies/preview/
npm run preview -- --base=/SaintsCookies/preview/
```

O build padrão usa o prefixo `/SaintsCookies/`, incluindo imagens carregadas pelo catálogo e pela sacola. O workflow fornece o prefixo específico de cada versão usando `--base`.

## Testes no navegador

```sh
npx playwright install chromium
npm run test:e2e
```

Para usar um Chromium já instalado: `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`.

## Funcionalidades

- Catálogo com filtros por clássicos, recheados e especiais.
- Sacola com quantidades, subtotal e persistência local.
- Seleção copiável para envio manual ao Instagram oficial.
- Layout adaptado para celular, navegação por teclado e suporte a movimento reduzido.
- Fontes e imagens locais, sem serviços externos necessários para renderização.

## Personalizar antes de lançar

Os sabores, preços e pesos em `src/products.js` são sugestões ilustrativas. As imagens foram geradas para esta proposta, e o logotipo é uma interpretação tipográfica. Substitua-os pelos dados, fotos e identidade oficiais. O fluxo não processa pagamentos nem confirma pedidos: a disponibilidade, valores e entrega são combinados com a marca pelo Instagram. Os links de Instagram e Linktree seguem a referência enviada.
