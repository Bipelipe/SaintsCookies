import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const origin = 'http://127.0.0.1:8788';
const identity = label => ({ name: `Teste ${label}`, email: `${label}-${randomUUID()}@example.test`, password: `Teste-${randomUUID()}` });
async function client(playwright, label, admin = false) {
  const person = identity(label);
  const api = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  const response = await api.post('/api/auth/register', { data: person });
  expect(response.status()).toBe(200);
  if (admin) execFileSync(process.execPath, ['scripts/promote-admin.mjs','--email',person.email,'--local'],{env:{...process.env,CREDITS_LOCAL_STATE:'.wrangler/test-state'}});
  return { api, person };
}
async function purchase(api, amount = 5000) {
  const response = await api.post('/api/orders', { data: { amount_cents: amount, note:'Pedido de teste', request_key: randomUUID() } });
  expect(response.status()).toBe(201);
  return (await response.json()).id;
}
const confirmOrder = (admin, id, reference = randomUUID(), amount = 5000) => admin.post(`/api/admin/orders/${id}/confirm`, { data: { amount_cents: amount, sale_reference: reference } });
const account = async api => (await api.get('/api/account')).json();

test('customer and admin UI: pending purchase, manual confirmation, points, reward and delivery', async ({ page, playwright, browser }) => {
  const customer = identity('cliente-ui');
  await page.goto('/creditos.html');
  await page.getByRole('button', { name:'Criar minha conta', exact:true }).click();
  await page.getByLabel('Seu nome').fill(customer.name);
  await page.getByLabel('E-mail', { exact:true }).fill(customer.email);
  await page.getByLabel('Senha', { exact:true }).fill(customer.password);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#balance')).toHaveText('0');
  await expect(page.locator('#admin-panel')).toBeHidden();
  await page.getByLabel('Valor da compra (R$)', { exact:true }).fill('50,99');
  await page.getByLabel('Identificação do pedido').fill('Compra pelo Instagram, teste de fidelidade');
  await page.getByRole('button', { name:'Enviar para conferência' }).click();
  await expect(page.locator('#orders-list')).toContainText('Aguardando conferência');
  await expect(page.locator('#balance')).toHaveText('0');
  const order = (await account(page.request)).orders[0];

  const admin = await client(playwright,'admin-ui',true);
  const context = await browser.newContext();
  const adminPage = await context.newPage();
  await adminPage.goto(`${origin}/creditos.html`);
  await adminPage.getByLabel('E-mail', { exact:true }).fill(admin.person.email);
  await adminPage.getByLabel('Senha', { exact:true }).fill(admin.person.password);
  await adminPage.getByRole('button', { name:'Entrar no clube' }).click();
  const orderCard = adminPage.locator('.admin-item').filter({ hasText:customer.email });
  await orderCard.getByLabel('Valor confirmado (R$)').fill('50,99');
  const reference = `venda-${randomUUID()}`;
  await orderCard.getByLabel('Referência única da venda').fill(reference);
  await orderCard.getByRole('button', { name:'Confirmar compra e liberar pontos' }).click();
  await expect(adminPage.locator('#feedback')).toContainText('Compra confirmada');
  expect((await confirmOrder(admin.api,order.id,reference,5099)).status()).toBe(200);
  await page.reload();
  await expect(page.locator('#balance')).toHaveText('50');
  expect((await account(page.request)).entries).toHaveLength(1);
  for (const width of [1440,390,320]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'/tmp/saints-creditos-customer.png',fullPage:true});

  page.once('dialog', dialog => dialog.accept());
  await page.locator('.reward-card').filter({ hasText:'Um clássico por nossa conta' }).getByRole('button', { name:'Trocar meus pontos' }).click();
  await expect(page.locator('#balance')).toHaveText('0');
  await expect(page.locator('#redemptions-list')).toContainText('Aguardando entrega');
  await adminPage.getByRole('button', { name:'Atualizar painel' }).click();
  await adminPage.setViewportSize({width:390,height:900});
  expect(await adminPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await adminPage.screenshot({path:'/tmp/saints-creditos-admin.png',fullPage:true});
  const gift = adminPage.locator('#admin-redemptions .admin-item').filter({ hasText:customer.email });
  await gift.getByRole('button', { name:'Marcar como entregue' }).click();
  await expect(adminPage.locator('#feedback')).toContainText('Entrega do brinde registrada');
  await page.reload();
  await expect(page.locator('#redemptions-list')).toContainText('Entregue');
  expect((await account(page.request)).balance).toBe(0);
  await page.getByRole('button', { name:'Sair da conta' }).click();
  await expect(page.locator('#auth-panel')).toBeVisible();
  expect((await page.request.get('/api/account')).status()).toBe(401);
  await context.close(); await admin.api.dispose();
});

test('authorization, password checks, origin protection and account isolation', async ({ playwright }) => {
  const a = await client(playwright,'isolated-a');
  const b = await client(playwright,'isolated-b');
  const id = await purchase(a.api);
  expect((await b.api.get('/api/admin/overview')).status()).toBe(403);
  expect((await b.api.post(`/api/admin/orders/${id}/confirm`, { data:{ amount_cents:5000,sale_reference:randomUUID() } })).status()).toBe(403);
  expect((await account(b.api)).orders).toHaveLength(0);
  expect((await a.api.post('/api/orders', { headers:{ Origin:'https://untrusted.example' }, data:{ amount_cents:5000,request_key:randomUUID() } })).status()).toBe(403);
  expect((await a.api.post('/api/orders', { data:{ amount_cents:-1,request_key:randomUUID() } })).status()).toBe(400);
  expect((await a.api.post('/api/orders', { data:{ amount_cents:5000,note:'x'.repeat(9000),request_key:randomUUID() } })).status()).toBe(413);
  expect((await a.api.get('/api/account')).headers()['cache-control']).toBe('no-store');
  expect((await a.api.post('/api/redemptions', { data:{ reward_id:'cookie-classico',request_key:randomUUID() } })).status()).toBe(409);
  expect((await account(a.api)).balance).toBe(0);
  const wrong = await a.api.post('/api/auth/login', { data:{ email:a.person.email,password:'not-the-right-password' } });
  expect(wrong.status()).toBe(401);
  const publicData = JSON.stringify(await account(a.api));
  expect(publicData).not.toContain('password_hash');
  expect(publicData).not.toContain(a.person.password);
  const cookie = (await a.api.storageState()).cookies.find(c=>c.name==='saints_creditos_session');
  expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe('Strict');
  const malicious = await b.api.post('/api/auth/register', { data:{ ...identity('role-injection'), role:'admin',points:9999 } });
  expect((await malicious.json()).user.role).toBe('customer');
  await a.api.dispose(); await b.api.dispose();
});

test('retries, duplicate references and concurrent redemptions cannot duplicate points', async ({ playwright }) => {
  const user = await client(playwright,'concurrent');
  const admin = await client(playwright,'concurrent-admin',true);
  const id = await purchase(user.api);
  const reference = `unique-${randomUUID()}`;
  const confirmations = await Promise.all([confirmOrder(admin.api,id,reference),confirmOrder(admin.api,id,reference)]);
  for(const response of confirmations) expect(response.status()).toBe(200);
  let data = await account(user.api);
  expect(data.balance).toBe(50); expect(data.entries).toHaveLength(1);
  const second = await purchase(user.api);
  expect((await confirmOrder(admin.api,second,reference)).status()).toBe(409);
  data = await account(user.api);
  expect(data.orders.find(o=>o.id===second).status).toBe('pending');
  expect(data.balance).toBe(50);
  expect((await admin.api.post(`/api/admin/orders/${id}/reject`,{data:{}})).status()).toBe(409);
  expect((await admin.api.post(`/api/admin/orders/${second}/reject`,{data:{}})).status()).toBe(200);
  expect((await confirmOrder(admin.api,second)).status()).toBe(409);
  const requests = [randomUUID(),randomUUID()];
  const results = await Promise.all(requests.map(key=>user.api.post('/api/redemptions',{data:{reward_id:'cookie-classico',request_key:key}})));
  expect(results.map(r=>r.status()).sort()).toEqual([201,409]);
  const winner = results.findIndex(r=>r.status()===201);
  expect((await user.api.post('/api/redemptions',{data:{reward_id:'cookie-classico',request_key:requests[winner]}})).status()).toBe(200);
  data = await account(user.api);
  expect(data.balance).toBe(0); expect(data.redemptions).toHaveLength(1); expect(data.entries).toHaveLength(2);
  await user.api.dispose(); await admin.api.dispose();
});

test('loyalty screens fit mobile and allow keyboard login', async ({ page }) => {
  for(const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/creditos.html');
    await expect(page.locator('#auth-form')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByLabel('E-mail', { exact:true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Senha', { exact:true })).toBeFocused();
});

test('a missing API shows a clear message instead of treating HTML as an account', async ({ page }) => {
  await page.route('**/api/account', route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Loja estática</title>'}));
  await page.goto('/creditos.html');
  await expect(page.locator('#feedback')).toContainText('O clube ainda não está disponível neste endereço');
  await expect(page.locator('#auth-panel')).toBeVisible();
});

test('the last reward cannot be reserved by two different customers', async ({ playwright }) => {
  const a = await client(playwright,'stock-a'), b = await client(playwright,'stock-b');
  const admin = await client(playwright,'stock-admin',true);
  const reward = `test-${randomUUID()}`;
  execFileSync(process.execPath,['scripts/wrangler.mjs','d1','execute','DB','--local','--config','wrangler.creditos.json','--persist-to','.wrangler/test-state','--command',`INSERT INTO rewards(id,title,description,cost,stock) VALUES('${reward}','Último brinde de teste','Teste de estoque simultâneo',50,1)`]);
  for(const customer of [a,b]) {
    const id = await purchase(customer.api);
    expect((await confirmOrder(admin.api,id)).status()).toBe(200);
  }
  const responses=await Promise.all([a,b].map(customer=>customer.api.post('/api/redemptions',{data:{reward_id:reward,request_key:randomUUID()}})));
  expect(responses.map(r=>r.status()).sort()).toEqual([201,409]);
  const balances=await Promise.all([a,b].map(async c=>(await account(c.api)).balance));
  expect(balances.sort((x,y)=>x-y)).toEqual([0,50]);
  const rewards=(await (await a.api.get('/api/rewards')).json()).rewards;
  expect(rewards.find(r=>r.id===reward).stock).toBe(0);
  await a.api.dispose();await b.api.dispose();await admin.api.dispose();
});
