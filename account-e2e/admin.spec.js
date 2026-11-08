import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const origin='http://127.0.0.1:8788';
const identity=label=>({name:`Teste ${label}`,email:`${label}-${randomUUID()}@example.test`,password:`Teste-${randomUUID()}`,phone:'11999999999',address:'Rua dos Testes, 123, Centro, São Paulo, SP',payment_preference:'pix',region_id:'plano-piloto'});
async function client(playwright,label,admin=false) {
  const person=identity(label),api=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});
  expect((await api.post('/api/auth/register',{data:person})).status()).toBe(200);
  if(admin)execFileSync(process.execPath,['scripts/promote-admin.mjs','--email',person.email,'--local'],{env:{...process.env,SAINTS_LOCAL_STATE:'.wrangler/test-state'}});
  const account=await(await api.get('/api/account')).json();return {api,person,id:account.user.id};
}
const assign=(admin,person,role,expected_role)=>admin.api.post(`/api/admin/users/${person.id}/role`,{data:{role,expected_role}});
async function order(customer) {
  const response=await customer.api.post('/api/checkout',{data:{items:[{id:'brown-butter',quantity:2}],request_key:randomUUID(),whatsapp_consent:false}});
  expect(response.status()).toBe(201);return(await response.json()).order;
}

test('admin, owner and customer permissions are enforced server-side and reflect role changes immediately',async({playwright,browser})=>{
  const admin=await client(playwright,'tier-admin',true),owner=await client(playwright,'tier-owner'),customer=await client(playwright,'tier-customer');
  expect((await assign(admin,owner,'owner','customer')).status()).toBe(200);
  const own=await(await owner.api.get('/api/account')).json();
  expect(own.user.role).toBe('owner');expect(own.user.permissions).toEqual({manage_users:false,manage_orders:true});
  const purchase=await order(customer);
  for(const person of [owner,customer]) {
    for(const path of ['/api/admin/users','/api/admin/dashboard','/api/admin/audit',`/api/admin/users/${customer.id}`,`/api/admin/users/${customer.id}/orders`,`/api/admin/orders/${purchase.id}`])expect((await person.api.get(path)).status()).toBe(403);
    expect((await person.api.post(`/api/admin/users/${person.id}/role`,{data:{role:'admin',expected_role:person===owner?'owner':'customer'}})).status()).toBe(403);
  }
  expect((await owner.api.get('/api/admin/overview')).status()).toBe(200);
  expect((await owner.api.post(`/api/admin/checkouts/${purchase.id}/confirm-payment`,{data:{}})).status()).toBe(200);
  const directory=await(await admin.api.get(`/api/admin/users?q=${encodeURIComponent(customer.person.email)}`)).json();
  expect(directory.total).toBe(1);expect(directory.users[0].order_count).toBe(1);expect(directory.users[0].paid_cents).toBe(2400);
  expect(JSON.stringify(directory)).not.toMatch(/password_hash|token_hash|never-expose/);
  const history=await(await admin.api.get(`/api/admin/users/${customer.id}/orders?limit=1&page=1`)).json();
  expect(history.orders[0].id).toBe(purchase.id);expect(history.total).toBe(1);
  const context=await browser.newContext({storageState:await owner.api.storageState()});
  const page=await context.newPage();await page.goto(`${origin}/conta`);
  await expect(page.locator('#customer-role')).toHaveText('Dono');await expect(page.locator('#admin-navigation')).toBeHidden();await expect(page.locator('#admin-panel')).toBeVisible();
  await page.goto(`${origin}/admin`);await expect(page.locator('#access-message')).toContainText('exclusivo do admin');await expect(page.locator('#administration-panel')).toBeHidden();
  expect((await assign(admin,owner,'customer','owner')).status()).toBe(200);
  expect((await owner.api.get('/api/admin/overview')).status()).toBe(403);
  expect((await assign(admin,admin,'customer','admin')).status()).toBe(409);
  expect((await assign(admin,owner,'admin','owner')).status()).toBe(409);
  const forbiddenOrigin=await admin.api.post(`/api/admin/users/${customer.id}/role`,{headers:{Origin:'https://untrusted.example'},data:{role:'admin',expected_role:'customer'}});
  expect(forbiddenOrigin.status()).toBe(403);
  await context.close();for(const person of [admin,owner,customer])await person.api.dispose();
});

test('exclusive admin UI lists accounts, edits roles, inspects purchase history and supports deep links on mobile',async({page,playwright})=>{
  const customer=await client(playwright,'panel-customer'),admin=await client(playwright,'panel-admin',true);
  const purchase=await order(customer);
  await page.goto('/admin');await expect(page.locator('#access-message')).toContainText('Entre na sua conta de admin');
  await page.getByRole('link',{name:'Entrar na minha conta',exact:true}).click();
  await page.getByLabel('E-mail',{exact:true}).fill(admin.person.email);await page.getByLabel('Senha',{exact:true}).fill(admin.person.password);
  await page.getByRole('button',{name:'Entrar na minha conta',exact:true}).click();
  await expect(page).toHaveURL(/\/admin(?:\.html)?$/);
  await expect(page.locator('#administration-panel')).toBeVisible();
  await page.getByLabel('Pesquisar conta',{exact:true}).fill(customer.person.email);await page.getByRole('button',{name:'Pesquisar contas',exact:true}).click();
  await expect(page.locator('#users-table tr')).toHaveCount(1);await expect(page.locator('#users-table')).toContainText(customer.person.email);
  await page.locator('#users-table').getByRole('link',{name:'Dados e histórico'}).click();
  await expect(page.locator('#user-detail')).toContainText(customer.person.address);
  await expect(page.locator('#user-order-history')).toContainText(purchase.number);
  await page.getByLabel('Cargo desta conta',{exact:true}).selectOption('owner');page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Salvar cargo',exact:true}).click();
  await expect(page.locator('#admin-feedback')).toContainText('Cargo atualizado');
  await expect(page.locator('#users-table .role-badge')).toHaveText('Dono');await expect(page.locator('#role-audit')).toContainText(customer.person.email);
  await page.locator('#user-order-history [data-open-order]').click();
  await expect(page.locator('#order-detail')).toContainText('2× Brown butter');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Confirmar pagamento deste pedido',exact:true}).click();
  await expect(page.locator('#order-detail')).toContainText('Pagamento confirmado');
  await page.reload();await expect(page.locator('#order-detail')).toContainText(purchase.number);
  for(const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'/tmp/saints-admin-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:'/tmp/saints-admin-mobile.png',fullPage:true});
  await customer.api.dispose();await admin.api.dispose();
});
