import { test,expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const origin='http://127.0.0.1:8788';
const person=()=>({name:'Cliente de encomenda',email:`checkout-${randomUUID()}@example.test`,password:`Teste-${randomUUID()}`,phone:'11999999999',address:'Rua dos Testes, 123, Centro, São Paulo, SP',payment_preference:'pix'});
async function client(playwright,admin=false) {
  const data=person(),api=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});
  expect((await api.post('/api/auth/register',{data})).status()).toBe(200);
  if(admin) execFileSync(process.execPath,['scripts/promote-admin.mjs','--email',data.email,'--local'],{env:{...process.env,CREDITS_LOCAL_STATE:'.wrangler/test-state'}});
  return {api,data};
}
const account=async api=>(await api.get('/api/account')).json();

test('cart to account checkout: accepted receipt survives a lost response and keeps points pending',async({page})=>{
  const customer=person();
  await page.goto('/');
  await page.getByRole('button',{name:'Adicionar O clássico à sacola',exact:true}).click();
  await page.locator('#open-bag').click();
  await page.getByRole('link',{name:'Fechar pedido',exact:true}).click();
  await page.getByRole('button',{name:'Criar minha conta',exact:true}).click();
  await page.getByLabel('Seu nome',{exact:true}).fill(customer.name);
  await page.getByLabel('Telefone do WhatsApp',{exact:true}).fill(customer.phone);
  await page.getByLabel('Endereço completo',{exact:true}).fill(customer.address);
  await page.getByLabel('Pagamento preferido',{exact:true}).selectOption('pix');
  await page.getByLabel('E-mail',{exact:true}).fill(customer.email);
  await page.getByLabel('Senha',{exact:true}).fill(customer.password);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#checkout-content')).toContainText('R$ 12,00');
  await expect(page.locator('#balance')).toHaveText('0');
  const consent=page.getByRole('checkbox',{name:/Autorizo a Saints/});
  await expect(consent).not.toBeChecked();await consent.check();
  // The server commits, but the client loses its first response. Replaying must
  // recover the same order, not create a second order or resend its receipt.
  await page.route('**/api/checkout',async route=>{
    await route.fetch();await route.abort('connectionreset');await page.unroute('**/api/checkout');
  });
  await page.getByRole('button',{name:'Confirmar e aceitar encomenda',exact:true}).click();
  await expect(page.locator('#feedback')).toContainText('Confira sua conexão');
  await page.reload();
  // Account data recovers the accepted order without requiring another click.
  await expect(page.locator('#checkout-content')).toContainText('Pedido aceito!');
  await expect(page.locator('#checkout-content')).toContainText('WhatsApp ainda não ativado');
  await expect(page.locator('#checkout-content')).toContainText('Pagamento pendente');
  const data=await account(page.request);
  expect(data.checkouts).toHaveLength(1);expect(data.orders).toHaveLength(1);
  expect(data.balance).toBe(0);expect(data.orders[0].status).toBe('pending');
  expect(await page.evaluate(()=>localStorage.getItem('saints-bag'))).toBeNull();
  for(const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.screenshot({path:'/tmp/saints-checkout-receipt.png',fullPage:true});
  await page.reload();await expect(page.locator('#checkout-history')).toContainText(data.checkouts[0].number);
});

test('checkout validates profiles, server totals, permissions and concurrent retries; payment alone releases points',async({playwright})=>{
  const customer=await client(playwright),other=await client(playwright),admin=await client(playwright,true);
  for(const invalid of [{phone:''},{address:''},{payment_preference:'unknown'}]) {
    expect((await customer.api.post('/api/profile',{data:{...customer.data,...invalid}})).status()).toBe(400);
  }
  const data={items:[{id:'classic',quantity:2,price:0}],amount_cents:1,request_key:randomUUID(),whatsapp_consent:false};
  const responses=await Promise.all([customer.api.post('/api/checkout',{data}),customer.api.post('/api/checkout',{data})]);
  expect(responses.map(r=>r.status()).sort()).toEqual([200,201]);
  const order=(await responses[0].json()).order;
  expect(order.amount_cents).toBe(2400);expect(order.status).toBe('accepted');expect(order.whatsapp_status).toBe('opted_out');
  expect((await account(customer.api)).checkouts).toHaveLength(1);
  expect((await account(other.api)).checkouts).toHaveLength(0);
  expect((await other.api.post(`/api/admin/checkouts/${order.id}/retry`,{data:{}})).status()).toBe(403);
  expect((await admin.api.post(`/api/admin/checkouts/${order.id}/retry`,{data:{}})).status()).toBe(409);
  expect((await customer.api.post('/api/checkout',{headers:{Origin:'https://untrusted.example'},data:{...data,request_key:randomUUID()}})).status()).toBe(403);
  expect((await customer.api.post('/api/checkout',{data:{...data,items:[{id:'unknown',quantity:1}],request_key:randomUUID()}})).status()).toBe(400);
  expect((await customer.api.post('/api/checkout',{data:{...data,items:[{id:'classic',quantity:3}]}})).status()).toBe(409);
  const confirm=`/api/admin/orders/${order.loyalty_order_id}/confirm`;
  expect((await admin.api.post(confirm,{data:{amount_cents:9999,sale_reference:`web-${order.id}`}})).status()).toBe(400);
  expect((await admin.api.post(confirm,{data:{amount_cents:2400,sale_reference:`web-${order.id}`}})).status()).toBe(200);
  const after=await account(customer.api);
  expect(after.balance).toBe(24);expect(after.checkouts[0].payment_status).toBe('confirmed');
  await customer.api.post('/api/profile',{data:{...customer.data,address:'Outro endereço completo, 999, São Paulo, SP'}});
  expect((await account(customer.api)).checkouts[0].address).toBe(customer.data.address);
  const overview=await (await admin.api.get('/api/admin/overview')).json();
  expect(overview.checkouts.find(o=>o.id===order.id).phone).toBe('5511999999999');
  for(const client of [customer,other,admin]) await client.api.dispose();
});

test('an existing account keeps login and must complete its profile before checkout',async({playwright})=>{
  const customer=await client(playwright);
  const current=await account(customer.api);
  execFileSync(process.execPath,['scripts/wrangler.mjs','d1','execute','DB','--local','--config','wrangler.creditos.json','--persist-to','.wrangler/test-state','--command',`DELETE FROM customer_profiles WHERE user_id='${current.user.id}'`]);
  expect((await customer.api.post('/api/auth/login',{data:customer.data})).status()).toBe(200);
  expect((await account(customer.api)).profile).toBeNull();
  const order={items:[{id:'classic',quantity:1}],request_key:randomUUID(),whatsapp_consent:false};
  expect((await customer.api.post('/api/checkout',{data:order})).status()).toBe(400);
  expect((await customer.api.post('/api/profile',{data:customer.data})).status()).toBe(200);
  expect((await customer.api.post('/api/checkout',{data:order})).status()).toBe(201);
  await customer.api.dispose();
});
