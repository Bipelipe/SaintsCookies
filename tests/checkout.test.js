import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCart, acceptCheckout, listCheckouts } from '../worker/checkout.js';
import { validateProfile, profileFor } from '../worker/profile.js';
import { testDatabase } from './helpers/d1.js';

const profile = {phone:'(11) 99999-9999',address:'Rua de Teste, 123, São Paulo, SP',payment_preference:'pix'};
async function customer(db,id='customer') {
  await db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,?)').bind(id,'Cliente de teste',`${id}@example.test`,'not-a-password').run();
  await db.prepare('INSERT INTO customer_profiles(user_id,phone,address,payment_preference) VALUES (?,?,?,?)').bind(id,'5511999999999',profile.address,'pix').run();
  return {id,name:'Cliente de teste'};
}
test('profile validation requires Brazilian DDD, complete address and known payment method',()=>{
  assert.equal(validateProfile(profile).phone,'5511999999999');
  assert.equal(validateProfile({...profile,phone:'+55 (11) 99999-9999'}).phone,'5511999999999');
  for(const invalid of [{phone:'123'}, {address:'Rua'}, {payment_preference:'free'}, {phone:'abc11999999999'}]) assert.throws(()=>validateProfile({...profile,...invalid}));
});
test('checkout ignores client prices and rejects unknown, duplicate or invalid items',()=>{
  assert.equal(priceCart([{id:'classic',quantity:2,price:0},{id:'hazelnut',quantity:1}]).amount_cents,4000);
  for(const items of [[],[{id:'unknown',quantity:1}],[{id:'classic',quantity:-1}],[{id:'classic',quantity:1.1}],[{id:'classic',quantity:100}],[{id:'classic',quantity:1},{id:'classic',quantity:2}]]) assert.throws(()=>priceCart(items));
});
test('checkout is atomic, idempotent, isolated and keeps immutable customer/item snapshots',async()=>{
  const db=testDatabase();
  try {
    const user=await customer(db), other=await customer(db,'other');
    const data={items:[{id:'classic',quantity:2}],request_key:crypto.randomUUID(),whatsapp_consent:true,amount_cents:1};
    const first=await acceptCheckout(db,{},user,data);
    assert.equal(first.order.status,'accepted'); assert.equal(first.order.payment_status,'pending');
    assert.equal(first.order.amount_cents,2400);assert.equal(first.order.whatsapp_status,'not_configured');
    const retry=await acceptCheckout(db,{},user,data);
    assert.equal(retry.order.id,first.order.id);assert.equal(retry.created,false);
    await assert.rejects(acceptCheckout(db,{},user,{...data,items:[{id:'classic',quantity:3}]}),/referência já foi usada/);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM orders').first()).n,1);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM point_entries').first()).n,0);
    assert.equal((await listCheckouts(db,other.id)).length,0);
    await db.prepare('UPDATE customer_profiles SET address=? WHERE user_id=?').bind('Outro endereço completo',user.id).run();
    assert.equal((await listCheckouts(db,user.id))[0].address,profile.address);
    assert.equal((await profileFor(db,user.id)).address,'Outro endereço completo');
  } finally {db.close();}
});
test('a failed transaction leaves no accepted order or orphan loyalty purchase',async()=>{
  const db=testDatabase();
  try {
    const user=await customer(db);
    db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON whatsapp_outbox BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
    await assert.rejects(acceptCheckout(db,{},user,{items:[{id:'classic',quantity:1}],request_key:'failed-order',whatsapp_consent:false}));
    for(const table of ['orders','checkout_orders','checkout_items','whatsapp_outbox']) assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,0);
  } finally {db.close();}
});
