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

O workflow `.github/workflows/deploy.yml` testa, compila e publica automaticamente a cada push em `main`. No GitHub, configure **Settings → Pages → Build and deployment → Source → GitHub Actions**. O endereço esperado é `https://bipelipe.github.io/SaintsCookies/`.

O build usa o prefixo `/SaintsCookies/`, incluindo imagens carregadas pelo catálogo e pela sacola. Para publicar em outro endereço, ajuste `base` em `vite.config.js`.

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
