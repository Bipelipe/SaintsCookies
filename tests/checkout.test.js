import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCart, acceptCheckout, listCheckouts } from '../worker/checkout.js';
import { validateProfile, profileFor } from '../worker/profile.js';
import { testDatabase } from './helpers/d1.js';

const profile = {phone:'(11) 99999-9999',address:'Rua de Teste, 123, São Paulo, SP',payment_preference:'pix',region_id:'plano-piloto'};
async function customer(db,id='customer') {
  await db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)').bind(id,'Cliente de teste',`${id}@example.test`,'not-a-password').run();
  await db.prepare('INSERT INTO customer_profiles(user_id,phone,address,payment_preference) VALUES (?,?,?,?)').bind(id,'5511999999999',profile.address,'pix').run();
  return {id,name:'Cliente de teste'};
}
test('profile validation requires Brazilian DDD, complete address and known payment method',()=>{
  assert.equal(validateProfile(profile).phone,'5511999999999');
  assert.equal(validateProfile({...profile,phone:'+55 (11) 99999-9999'}).phone,'5511999999999');
  assert.equal(validateProfile({...profile,payment_preference:'cash'}).payment_preference,'cash');
  for(const invalid of [{phone:'123'}, {address:'Rua'}, {payment_preference:'free'}, {payment_preference:'credit_card'}, {payment_preference:'debit_card'}, {phone:'abc11999999999'}]) assert.throws(()=>validateProfile({...profile,...invalid}));
});
test('a legacy card preference requires a new choice without changing or blocking old receipts',async()=>{
  const db=testDatabase();
  try {
    const user=await customer(db);
    const request={items:[{id:'brown-butter',quantity:1}],request_key:'old-card-order',whatsapp_consent:false};
    const first=await acceptCheckout(db,{},user,request);
    await db.prepare("UPDATE checkout_orders SET payment_preference='credit_card' WHERE id=?").bind(first.order.id).run();
    await db.prepare("UPDATE customer_profiles SET payment_preference='credit_card' WHERE user_id=?").bind(user.id).run();
    const recovered=await acceptCheckout(db,{},user,request);
    assert.equal(recovered.created,false);
    assert.equal(recovered.order.payment_preference,'credit_card');
    await assert.rejects(acceptCheckout(db,{},user,{...request,request_key:'new-order'}),/escolha Pix ou Dinheiro/);
    await db.prepare("UPDATE customer_profiles SET payment_preference='cash' WHERE user_id=?").bind(user.id).run();
    const next=await acceptCheckout(db,{},user,{...request,request_key:'new-order'});
    assert.equal(next.order.payment_preference,'cash');
    assert.equal((await listCheckouts(db,user.id)).find(o=>o.id===first.order.id).payment_preference,'credit_card');
  } finally {db.close();}
});
test('checkout ignores client prices and rejects unknown, duplicate or invalid items',()=>{
  assert.equal(priceCart([{id:'brown-butter',quantity:2,price:0},{id:'red-velvet',quantity:1}]).amount_cents,3600);
  for(const items of [[],[{id:'unknown',quantity:1}],[{id:'brown-butter',quantity:-1}],[{id:'brown-butter',quantity:1.1}],[{id:'brown-butter',quantity:100}],[{id:'brown-butter',quantity:1},{id:'brown-butter',quantity:2}]]) assert.throws(()=>priceCart(items));
});
test('the server prices biscuit pots, snapshots their content and rejects retired flavors',()=>{
  const priced=priceCart([{id:'brown-butter',quantity:1,price:0},{id:'amanteigado',quantity:2},{id:'parmesao',quantity:1}]);
  assert.equal(priced.amount_cents,5100);
  assert.equal(priced.items.find(i=>i.product_id==='parmesao').unit_cents,1500);
  assert.match(priced.items.find(i=>i.product_id==='parmesao').product_name,/pote de 100 g/);
  assert.match(priced.items.find(i=>i.product_id==='brown-butter').product_name,/cookie de aprox\. 90 g/);
  assert.throws(()=>priceCart([{id:'hazelnut',quantity:1}]),/cardápio atual/);
});
test('an accepted order with a retired flavor can be retrieved again without changing its original snapshot',async()=>{
  const db=testDatabase();
  try {
    const user=await customer(db);
    const request={items:[{id:'brown-butter',quantity:2}],request_key:'historical-checkout',whatsapp_consent:false};
    const first=await acceptCheckout(db,{},user,request);
    const oldKey=JSON.stringify({items:[['classic',2]],consent:false});
    await db.prepare('UPDATE checkout_orders SET cart_key=? WHERE id=?').bind(oldKey,first.order.id).run();
    await db.prepare("UPDATE checkout_items SET product_id='classic',product_name='O clássico original' WHERE checkout_id=?").bind(first.order.id).run();
    const recovered=await acceptCheckout(db,{},user,{...request,items:[{id:'classic',quantity:2}]});
    assert.equal(recovered.created,false);assert.equal(recovered.order.id,first.order.id);
    assert.equal(recovered.order.items[0].product_name,'O clássico original');assert.equal(recovered.order.amount_cents,2400);
    await assert.rejects(acceptCheckout(db,{},user,{...request,request_key:'another-purchase',items:[{id:'classic',quantity:2}]}),/cardápio atual/);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM checkout_orders').first()).n,1);
  }finally{db.close();}
});
test('checkout is atomic, idempotent, isolated and keeps immutable customer/item snapshots',async()=>{
  const db=testDatabase();
  try {
    const user=await customer(db), other=await customer(db,'other');
    const data={items:[{id:'brown-butter',quantity:2}],request_key:crypto.randomUUID(),whatsapp_consent:true,amount_cents:1};
    const first=await acceptCheckout(db,{},user,data);
    assert.equal(first.order.status,'accepted'); assert.equal(first.order.payment_status,'pending');
    assert.equal(first.order.amount_cents,2400);assert.equal(first.order.whatsapp_status,'not_configured');
    const retry=await acceptCheckout(db,{},user,data);
    assert.equal(retry.order.id,first.order.id);assert.equal(retry.created,false);
    await assert.rejects(acceptCheckout(db,{},user,{...data,items:[{id:'brown-butter',quantity:3}]}),/referência já foi usada/);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM orders').first()).n,1);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM point_entries').first()).n,0);
    assert.equal((await listCheckouts(db,other.id)).length,0);
    await db.prepare('UPDATE customer_profiles SET address=? WHERE user_id=?').bind('Outro endereço completo',user.id).run();
    assert.equal((await listCheckouts(db,user.id))[0].address,profile.address);
    assert.equal((await profileFor(db,user.id)).address,'Outro endereço completo');
  } finally {db.close();}
});
test('a failed transaction leaves no accepted order or orphan payment record',async()=>{
  const db=testDatabase();
  try {
    const user=await customer(db);
    db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON whatsapp_outbox BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
    await assert.rejects(acceptCheckout(db,{},user,{items:[{id:'brown-butter',quantity:1}],request_key:'failed-order',whatsapp_consent:false}));
    for(const table of ['orders','checkout_orders','checkout_items','whatsapp_outbox']) assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,0);
  } finally {db.close();}
});
