import { test,expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const origin='http://127.0.0.1:8788';
const identity=label=>({name:`Teste ${label}`,email:`${label}-${randomUUID()}@example.test`,password:`Teste-${randomUUID()}`,phone:'11999999999',address:'Rua dos Testes, 123, Centro, São Paulo, SP',payment_preference:'pix',region_id:'plano-piloto'});
const account=async api=>(await api.get('/api/account')).json();
function sql(command) {
  const result=execFileSync(process.execPath,['scripts/wrangler.mjs','d1','execute','DB','--local','--config','wrangler.dev.json','--persist-to','.wrangler/test-state','--command',command,'--json'],{encoding:'utf8'});
  return JSON.parse(result).flatMap(row=>row.results);
}
async function client(playwright,label,admin=false) {
  const person=identity(label);
  const api=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{Origin:origin}});
  expect((await api.post('/api/auth/register',{data:person})).status()).toBe(200);
  if(admin) sql(`UPDATE users SET role='admin' WHERE email='${person.email}'`);
  return {api,person};
}
async function register(page,person) {
  await page.goto('/conta.html');
  await page.getByRole('button',{name:'Criar minha conta',exact:true}).click();
  await expect(page.getByLabel('Pagamento preferido',{exact:true}).locator('option')).toHaveText(['Selecione uma opção','Pix','Dinheiro']);
  for(const [label,value] of [['Seu nome',person.name],['Telefone do WhatsApp',person.phone],['Endereço completo',person.address],['E-mail',person.email],['Senha',person.password]]) await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByLabel('Pagamento preferido',{exact:true}).selectOption('pix');
  await page.getByLabel('Região administrativa (RA)',{exact:true}).selectOption(person.region_id);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#account-panel')).toBeVisible();
}

test('signup, profile editing, order checkout and logout remain available without loyalty UI',async({page})=>{
  const person=identity('perfil-ui');
  await register(page,person);
  await expect(page.locator('#customer-name')).toHaveText(person.name);
  await expect(page.locator('#admin-panel')).toBeHidden();
  await expect(page.locator('main')).not.toContainText(/pontos|resgates|recompensa|brindes/i);
  await page.locator('#profile-details summary').click();
  await expect(page.getByLabel('Forma de pagamento preferida',{exact:true}).locator('option')).toHaveText(['Selecione uma opção','Pix','Dinheiro']);
  await page.getByLabel('Forma de pagamento preferida',{exact:true}).selectOption('cash');
  await page.getByLabel('RA cadastrada',{exact:true}).selectOption('gama');
  await page.getByLabel('Nome completo',{exact:true}).fill('Nome atualizado');
  await page.getByLabel('Endereço cadastrado',{exact:true}).fill('Rua Atualizada, 456, São Paulo, SP');
  await page.getByRole('button',{name:'Salvar meus dados',exact:true}).click();
  await expect(page.locator('#feedback')).toContainText('Seus dados foram salvos');
  await page.reload();
  await expect(page.locator('#customer-name')).toHaveText('Nome atualizado');
  expect((await account(page.request)).profile.address).toBe('Rua Atualizada, 456, São Paulo, SP');
  expect((await account(page.request)).profile.payment_preference).toBe('cash');
  expect((await account(page.request)).profile.region_id).toBe('gama');
  await expect(page.getByLabel('RA cadastrada',{exact:true})).toHaveValue('gama');
  await page.getByRole('button',{name:'Sair da conta',exact:true}).click();
  await expect(page.locator('#auth-panel')).toBeVisible();
  expect((await page.request.get('/api/account')).status()).toBe(401);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByLabel('E-mail',{exact:true}).fill(person.email);
  await page.getByLabel('Senha',{exact:true}).fill(person.password);
  await page.getByRole('button',{name:'Entrar na minha conta',exact:true}).click();
  await expect(page.locator('#customer-name')).toHaveText('Nome atualizado');
});

test('Brazil phone fields format typing, paste, edits and saved profiles; signup shows the new password rules',async({page})=>{
  const person={...identity('phone-mask'),password:'Abc123'};
  await page.setViewportSize({width:390,height:900});
  await page.goto('/conta.html');
  await page.getByRole('button',{name:'Criar minha conta',exact:true}).click();
  const region=page.getByLabel('Região administrativa (RA)',{exact:true});
  await expect(region.locator('option')).toHaveCount(36);
  await expect(region).not.toContainText('R$');
  await page.setViewportSize({width:1440,height:900});
  const addressBox=await page.getByLabel('Endereço completo',{exact:true}).boundingBox();
  const regionBox=await region.boundingBox();
  expect(regionBox.x).toBeGreaterThan(addressBox.x+addressBox.width);
  expect(Math.abs(regionBox.y-addressBox.y)).toBeLessThan(4);
  await page.setViewportSize({width:390,height:900});
  expect((await region.boundingBox()).y).toBeGreaterThan((await page.getByLabel('Endereço completo',{exact:true}).boundingBox()).y);
  expect(await region.evaluate(field=>field.checkValidity())).toBe(false);
  const phone=page.getByLabel('Telefone do WhatsApp',{exact:true});
  await expect(page.locator('#registration-fields .phone-country')).toHaveText('+55');
  await expect(phone).toHaveAttribute('placeholder','(11) 99999-9999');
  await phone.pressSequentially('11987654321');
  await expect(phone).toHaveValue('(11) 98765-4321');
  await phone.press('Backspace');await phone.press('1');
  await expect(phone).toHaveValue('(11) 98765-4321');
  await phone.fill('+55 (21) 99876-5432');
  await expect(phone).toHaveValue('(21) 99876-5432');
  await phone.fill('11');
  expect(await phone.evaluate(input=>input.checkValidity())).toBe(false);
  const password=page.getByLabel('Senha',{exact:true});
  await expect(page.locator('#password-rules')).toContainText('6 a 128 caracteres');
  for(const invalid of ['Abc12','abcdef1','ABCDEF1','Abcdef']) {
    await password.fill(invalid);
    expect(await password.evaluate(input=>input.checkValidity())).toBe(false);
  }
  await password.fill('Abc123');
  expect(await password.evaluate(input=>input.checkValidity())).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/saints-registration-phone.png',fullPage:true});
  await register(page,person);
  await page.locator('#profile-details summary').click();
  const saved=page.getByLabel('Telefone cadastrado',{exact:true});
  await expect(saved).toHaveValue('(11) 99999-9999');
  await saved.fill('5521998765432');
  await expect(saved).toHaveValue('(21) 99876-5432');
  await page.getByRole('button',{name:'Salvar meus dados',exact:true}).click();
  await expect(page.locator('#feedback')).toContainText('Seus dados foram salvos');
  expect((await account(page.request)).profile.phone).toBe('5521998765432');
  await page.reload();
  await expect(saved).toHaveValue('(21) 99876-5432');
  await page.getByRole('button',{name:'Sair da conta',exact:true}).click();
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(password).not.toHaveAttribute('pattern',/.+/);
  await expect(page.locator('#password-rules')).toBeHidden();
});

test('authorization, passwords, origin checks and customer privacy remain protected',async({playwright})=>{
  const a=await client(playwright,'private-a'),b=await client(playwright,'private-b');
  const checkout={items:[{id:'brown-butter',quantity:1}],request_key:randomUUID(),whatsapp_consent:false};
  const order=(await (await a.api.post('/api/checkout',{data:checkout})).json()).order;
  expect((await b.api.get('/api/admin/overview')).status()).toBe(403);
  expect((await b.api.post(`/api/admin/checkouts/${order.id}/confirm-payment`,{data:{}})).status()).toBe(403);
  expect((await account(b.api)).checkouts).toHaveLength(0);
  expect((await a.api.post('/api/profile',{headers:{Origin:'https://untrusted.example'},data:a.person})).status()).toBe(403);
  expect((await a.api.post('/api/profile',{data:{...a.person,address:'x'.repeat(9000)}})).status()).toBe(413);
  expect((await a.api.get('/api/account')).headers()['cache-control']).toBe('no-store');
  const wrong=await a.api.post('/api/auth/login',{data:{email:a.person.email,password:'not-the-right-password'}});
  expect(wrong.status()).toBe(401);
  const data=await account(a.api);
  expect(JSON.stringify(data)).not.toContain('password_hash');expect(JSON.stringify(data)).not.toContain(a.person.password);
  for(const field of ['balance','entries','rewards','redemptions','orders']) expect(data).not.toHaveProperty(field);
  const cookie=(await a.api.storageState()).cookies.find(c=>c.name==='saints_creditos_session');
  expect(cookie.httpOnly).toBe(true);expect(cookie.sameSite).toBe('Strict');
  const malicious=await b.api.post('/api/auth/register',{data:{...identity('role-injection'),role:'admin',points:9999}});
  expect((await malicious.json()).user.role).toBe('customer');
  await a.api.dispose();await b.api.dispose();
});

test('removed loyalty endpoints cannot change historical balances, rewards or redemptions',async({playwright})=>{
  const customer=await client(playwright,'historical'),admin=await client(playwright,'payments-admin',true);
  const id=(await account(customer.api)).user.id;
  const old=randomUUID(),entry=randomUUID(),redemption=randomUUID(),debit=randomUUID();
  sql(`INSERT INTO orders(id,user_id,request_key,amount_cents,status,points,sale_reference) VALUES('${old}','${id}','old-${old}',10000,'confirmed',100,'old-${old}'); INSERT INTO point_entries(id,user_id,delta,description,order_id) VALUES('${entry}','${id}',100,'Crédito histórico','${old}')`);
  sql(`INSERT INTO redemptions(id,user_id,reward_id,request_key,points) VALUES('${redemption}','${id}','cookie-classico','old-${redemption}',50); INSERT INTO point_entries(id,user_id,delta,description,redemption_id) VALUES('${debit}','${id}',-50,'Resgate histórico','${redemption}'); UPDATE rewards SET stock=19 WHERE id='cookie-classico'`);
  const before=sql('SELECT * FROM point_entries ORDER BY id');
  const redemptions=sql('SELECT * FROM redemptions ORDER BY id');
  const rewards=sql('SELECT * FROM rewards ORDER BY id');
  for(const [path,method] of [['/api/rewards','get'],['/api/redemptions','post'],['/api/orders','post'],[`/api/admin/orders/${old}/confirm`,'post'],[`/api/admin/redemptions/${old}/fulfill`,'post']]) {
    expect((await admin.api[method](path,method==='post'?{data:{request_key:randomUUID(),reward_id:'cookie-classico',amount_cents:5000,sale_reference:randomUUID()}}:undefined)).status()).toBe(404);
  }
  const result=await customer.api.post('/api/checkout',{data:{items:[{id:'brown-butter',quantity:2}],request_key:randomUUID(),whatsapp_consent:false}});
  expect(result.status()).toBe(201);const order=(await result.json()).order;
  const confirm=()=>admin.api.post(`/api/admin/checkouts/${order.id}/confirm-payment`,{data:{}});
  for(const response of await Promise.all([confirm(),confirm()])) expect(response.status()).toBe(200);
  expect((await account(customer.api)).checkouts[0].payment_status).toBe('confirmed');
  expect(sql('SELECT * FROM point_entries ORDER BY id')).toEqual(before);
  expect(sql('SELECT * FROM rewards ORDER BY id')).toEqual(rewards);
  expect(sql('SELECT * FROM redemptions ORDER BY id')).toEqual(redemptions);
  expect(sql(`SELECT points FROM orders WHERE id='${old}'`)[0].points).toBe(100);
  expect(sql(`SELECT o.points FROM orders o JOIN checkout_orders c ON c.loyalty_order_id=o.id WHERE c.id='${order.id}'`)[0].points).toBe(0);
  await customer.api.dispose();await admin.api.dispose();
});

test('admin can confirm a checkout payment through the interface without granting credits',async({page,playwright})=>{
  const customer=await client(playwright,'admin-ui-customer'),admin=await client(playwright,'admin-ui',true);
  const order=(await (await customer.api.post('/api/checkout',{data:{items:[{id:'red-velvet',quantity:1}],request_key:randomUUID(),whatsapp_consent:false}})).json()).order;
  await page.goto('/conta.html');
  await page.getByLabel('E-mail',{exact:true}).fill(admin.person.email);
  await page.getByLabel('Senha',{exact:true}).fill(admin.person.password);
  await page.getByRole('button',{name:'Entrar na minha conta',exact:true}).click();
  const card=page.locator('#admin-checkouts .web-order').filter({hasText:order.number});
  await expect(card).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await card.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
  await expect(page.locator('#feedback')).toContainText('Pagamento confirmado');
  await expect(page.locator('#admin-checkouts')).toContainText('Pagamento conferido pela equipe');
  await expect(page.locator('#admin-panel')).not.toContainText(/pontos|brindes|resgates|recompensa/i);
  await page.setViewportSize({width:390,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/saints-dev-admin.png',fullPage:true});
  await customer.api.dispose();await admin.api.dispose();
});

test('account login is responsive and legacy links redirect to the current account page',async({page})=>{
  for(const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/conta');
    await expect(page.locator('#auth-form')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByLabel('E-mail',{exact:true}).focus();await page.keyboard.press('Tab');
  await expect(page.getByLabel('Senha',{exact:true})).toBeFocused();
  await page.goto('/creditos?checkout=1');
  await expect(page).toHaveURL(/\/conta(?:\.html)?\?checkout=1$/);
  await expect(page.locator('#auth-panel')).toBeVisible();
  await page.screenshot({path:'/tmp/saints-dev-account.png',fullPage:true});
});

test('a static host without the API explains why login is unavailable',async({page})=>{
  await page.route('**/api/account',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Loja estática</title>'}));
  await page.goto('/conta.html');
  await expect(page.locator('#feedback')).toContainText('A área da conta ainda não está disponível neste endereço');
  await expect(page.locator('#auth-panel')).toBeVisible();
});
