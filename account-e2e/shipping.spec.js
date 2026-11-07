import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const origin='http://127.0.0.1:8788';
function sql(command) {
  execFileSync(process.execPath,['scripts/wrangler.mjs','d1','execute','DB','--local','--config','wrangler.dev.json','--persist-to','.wrangler/test-state','--command',command],{stdio:'pipe'});
}
test('delivery confirms the saved address, supports updates, saves server shipping totals and shows them to admin',async({page})=>{
  // Each browser scenario represents a separate customer/IP; reset only the
  // disposable rate ledger so this test does not inherit earlier traffic.
  sql('DROP TABLE checkout_fulfillment; DELETE FROM rate_limits');
  const config=await (await page.request.get('/api/checkout/config')).json();
  expect(config.ready).toBe(true);expect(config.shipping_regions).toHaveLength(35);
  const person={name:'Cliente de entrega',email:`shipping-${randomUUID()}@example.test`,password:`Teste-${randomUUID()}`,phone:'61987654321',address:'QE 12, conjunto A, casa 10, Guará, Brasília, DF',payment_preference:'pix'};
  expect((await page.request.post('/api/auth/register',{headers:{Origin:origin},data:person})).status()).toBe(200);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:'Adicionar Brown butter à sacola',exact:true}).click();
  await page.getByRole('button',{name:'Abrir sacola'}).click();
  await page.getByRole('tab',{name:'Retirada ou entrega',exact:true}).click();
  await page.getByLabel('Receber em casa',{exact:false}).check();
  await expect(page.getByText('Seu endereço ainda é este?',{exact:true})).toBeVisible();
  await expect(page.locator('.delivery-address')).toHaveText(person.address);
  await expect(page.getByLabel('Sim, este é meu endereço de entrega.',{exact:true})).not.toBeChecked();
  await page.getByLabel('RA do endereço de entrega').selectOption('guara');
  await page.getByRole('link',{name:'Não, quero atualizar o endereço',exact:true}).click();
  const newAddress='QE 14, conjunto B, casa 20, Guará, Brasília, DF';
  await page.getByLabel('Endereço cadastrado',{exact:true}).fill(newAddress);
  await page.getByRole('button',{name:'Salvar meus dados',exact:true}).click();
  await expect(page.locator('#feedback')).toContainText('Seus dados foram salvos');
  await expect(page.locator('.delivery-address')).toHaveText(newAddress);
  const submit=page.getByRole('button',{name:'Confirmar e aceitar encomenda',exact:true});
  await expect(submit).toBeDisabled();
  await page.getByLabel('Sim, este é meu endereço de entrega.',{exact:true}).check();
  await expect(submit).toBeEnabled();
  await expect(page.locator('.grand-total')).toContainText('R$ 22,00');
  await page.screenshot({path:'/tmp/saints-shipping-confirm-mobile.png',fullPage:true});
  // Another tab changes the profile after confirmation. The server must refuse
  // the stale address, and the customer must be able to reconfirm and retry.
  const latestAddress='QE 16, conjunto C, casa 30, Guará, Brasília, DF';
  expect((await page.request.post('/api/profile',{headers:{Origin:origin},data:{...person,address:latestAddress}})).status()).toBe(200);
  await submit.click();
  await expect(page.locator('#feedback')).toContainText('Seu endereço foi atualizado');
  await expect(page.locator('.delivery-address')).toHaveText(latestAddress);
  await expect(submit).toBeDisabled();
  await page.getByLabel('Sim, este é meu endereço de entrega.',{exact:true}).check();
  await submit.click();
  await expect(page.locator('#checkout-content')).toContainText('Pedido aceito!');
  await expect(page.locator('#checkout-content')).toContainText('Frete: R$ 10,00');
  await expect(page.locator('#checkout-content')).toContainText('Total: R$ 22,00');
  const account=await (await page.request.get('/api/account')).json();
  expect(account.checkouts).toHaveLength(1);
  const order=account.checkouts[0];
  expect(order.fulfillment).toBe('delivery');expect(order.products_cents).toBe(1200);
  expect(order.shipping_cents).toBe(1000);expect(order.amount_cents).toBe(2200);
  expect(order.delivery_address).toBe(latestAddress);expect(order.region_name).toBe('Guará');
  sql(`UPDATE users SET role='admin' WHERE email='${person.email}'`);
  await page.goto(`/admin?order=${order.id}`);
  await expect(page.locator('#order-detail')).toContainText('Frete · Guará');
  await expect(page.locator('#order-detail')).toContainText('R$ 22,00');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Confirmar pagamento deste pedido',exact:true}).click();
  await expect(page.locator('#order-detail')).toContainText('Pagamento confirmado');
  const after=await (await page.request.get('/api/account')).json();
  expect(after.checkouts[0].amount_cents).toBe(2200);
  for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
