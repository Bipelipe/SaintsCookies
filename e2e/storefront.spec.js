import { test, expect } from '@playwright/test';

test('filters, adds, persists and removes cookies from the bag', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Bem recheados', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Adicionar Chocolate & avelã à sacola', exact: true }).click();
  await expect(page.locator('.bag-count')).toHaveText('1');
  await page.reload();
  await expect(page.locator('.bag-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Abrir sacola' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Adicionar uma unidade de Chocolate & avelã' }).click();
  await expect(dialog.locator('.subtotal')).toContainText('32,00');
  await expect(dialog.locator('.sample-notice')).toContainText('ilustrativo');
  await dialog.getByRole('button', { name: 'Remover uma unidade de Chocolate & avelã' }).click();
  await dialog.getByRole('button', { name: 'Remover uma unidade de Chocolate & avelã' }).click();
  await expect(dialog.locator('.empty-bag')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Abrir sacola' })).toBeFocused();
  expect(errors).toEqual([]);
});

test('selection can be copied for a real conversation', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Adicionar O clássico à sacola', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir sacola' }).click();
  await page.getByRole('button', { name: 'Copiar minha seleção' }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('1× O clássico');
  expect(text).toContain('confirmar os sabores, valores');
  await expect(page.getByRole('link', { name: 'Enviar pelo Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/saintscookies/');
});

test('desktop and mobile layouts load images and have no horizontal overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.locator('footer').scrollIntoViewIfNeeded();
    await expect.poll(async () => (await page.locator('.header').boundingBox()).y).toBe(0);
    await page.getByRole('button', { name: 'Abrir sacola' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Fechar sacola' }).click();
    await expect.poll(() => page.locator('img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `/tmp/saints-${width}.png`, fullPage: true });
  }
});

test('categories stay accessible within the catalog and leave before the brand story', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(() => {
      const card = document.querySelectorAll('.product-card')[3];
      window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 210);
    });
    const header = page.locator('.header');
    const toolbar = page.locator('.catalog-toolbar');
    const headerBottom = (await header.boundingBox()).height;
    await expect.poll(async () => (await toolbar.boundingBox()).y).toBe(headerBottom);

    await page.getByRole('button', { name: 'Especiais', exact: true }).click();
    await expect(page.locator('.product-card')).toHaveCount(1);
    await expect(page.locator('.product-card h3')).toHaveText('Pistache dos céus');
    await expect.poll(async () => (await toolbar.boundingBox()).y).toBe(headerBottom);
    const toolbarBox = await toolbar.boundingBox();
    const productBox = await page.locator('.product-card').boundingBox();
    expect(productBox.y).toBeGreaterThanOrEqual(toolbarBox.y + toolbarBox.height);
    expect(productBox.y).toBeLessThan(350);

    await page.getByRole('button', { name: 'Bem recheados', exact: true }).click();
    await expect(page.locator('.product-card')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Bem recheados', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Adicionar Chocolate & avelã à sacola', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir sacola' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Fechar sacola' }).click();

    await page.evaluate(() => {
      const story = document.querySelector('#essencia');
      const header = document.querySelector('.header');
      window.scrollTo(0, story.getBoundingClientRect().top + window.scrollY - header.getBoundingClientRect().height);
    });
    await expect.poll(async () => {
      const box = await toolbar.boundingBox();
      return box.y + box.height;
    }).toBeLessThanOrEqual(headerBottom);
    await expect.poll(async () => (await header.boundingBox()).y).toBe(0);
  }
});
