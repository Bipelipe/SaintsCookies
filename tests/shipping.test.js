import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shippingRegions,shippingQuote } from '../src/shipping.js';
import { acceptCheckout,listCheckouts } from '../worker/checkout.js';
import { ensureShippingSchema } from '../worker/shipping-schema.js';
import { testDatabase } from './helpers/d1.js';

const address='SQN 123, bloco A, apartamento 101, Brasília, DF';
async function setup(db) {
  await db.prepare("INSERT INTO users(id,name,email,password_hash) VALUES('shipping','Cliente de entrega','shipping@example.test','preserved-hash')").run();
  await db.prepare("INSERT INTO customer_profiles(user_id,phone,address,payment_preference) VALUES('shipping','5561999999999',?,'pix')").bind(address).run();
  return {id:'shipping',name:'Cliente de entrega'};
}
const request=()=>({items:[{id:'brown-butter',quantity:2}],request_key:crypto.randomUUID(),whatsapp_consent:false,
  fulfillment:{method:'delivery',region_id:'plano-piloto',address_confirmed:true,confirmed_address:address,expected_shipping_cents:1000}});

test('DF shipping table covers 35 unique regions with integer test rates',()=>{
  assert.equal(shippingRegions.length,35);assert.equal(new Set(shippingRegions.map(r=>r.id)).size,35);
  for(const r of shippingRegions) assert.ok(Number.isInteger(r.fee_cents)&&r.fee_cents>0);
  assert.equal(shippingQuote({method:'pickup',region_id:'gama'}).fee_cents,0);
});
test('delivery saves an atomic server-priced fee, total, RA and confirmed address',async()=>{
  const db=testDatabase();try {
    const user=await setup(db),data=request();
    data.amount_cents=1;data.fulfillment.shipping_cents=0;
    const {order}=await acceptCheckout(db,{},user,data);
    assert.equal(order.fulfillment,'delivery');assert.equal(order.products_cents,2400);
    assert.equal(order.shipping_cents,1000);assert.equal(order.amount_cents,3400);
    assert.equal(order.region_name,'Plano Piloto');assert.equal(order.delivery_address,address);
    assert.ok(order.address_confirmed_at>0);
    assert.equal((await db.prepare('SELECT amount_cents FROM orders WHERE id=(SELECT loyalty_order_id FROM checkout_orders WHERE id=?)').bind(order.id).first()).amount_cents,3400);
  } finally {db.close();}
});
test('delivery rejects unknown RA, absent confirmation, stale address and stale/manipulated fee before creating orders',async()=>{
  const db=testDatabase();try {
    const user=await setup(db);
    for(const change of [{region_id:'not-a-region'},{address_confirmed:false},{confirmed_address:'Outro endereço, 123, Brasília, DF'},{expected_shipping_cents:0},{method:'teleport'}]) {
      const data=request();Object.assign(data.fulfillment,change);
      await assert.rejects(acceptCheckout(db,{},user,data),error=>error.status===400);
    }
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM checkout_orders').first()).n,0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM orders').first()).n,0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM checkout_fulfillment').first()).n,0);
  } finally {db.close();}
});
test('delivery retries preserve the original fee/address while changed delivery choices cannot reuse the reference',async()=>{
  const db=testDatabase();try {
    const user=await setup(db),data=request();
    const results=await Promise.all([acceptCheckout(db,{},user,data),acceptCheckout(db,{},user,data)]);
    assert.equal(results.filter(r=>r.created).length,1);
    await db.prepare("UPDATE customer_profiles SET address='Endereço atualizado, 456, Brasília, DF' WHERE user_id=?").bind(user.id).run();
    const replay=await acceptCheckout(db,{},user,{...data,fulfillment:{...data.fulfillment,expected_shipping_cents:9999}});
    assert.equal(replay.created,false);assert.equal(replay.order.delivery_address,address);assert.equal(replay.order.amount_cents,3400);
    await assert.rejects(acceptCheckout(db,{},user,{...data,fulfillment:{...data.fulfillment,region_id:'gama'}}),error=>error.status===409);
    await assert.rejects(acceptCheckout(db,{},user,{...data,fulfillment:{method:'pickup'}}),error=>error.status===409);
    assert.equal((await listCheckouts(db,user.id)).length,1);
  } finally {db.close();}
});
test('pickup needs no address confirmation, charges no fee and old orders survive the repeatable additive upgrade',async()=>{
  const db=testDatabase();try {
    const user=await setup(db),data={...request(),fulfillment:{method:'pickup',shipping_cents:9999}};
    const first=await acceptCheckout(db,{},user,data);
    assert.equal(first.order.fulfillment,'pickup');assert.equal(first.order.amount_cents,2400);
    assert.equal(first.order.shipping_cents,0);assert.equal(first.order.delivery_address,null);
    // Simulate a pre-upgrade order: no extension row/table, legacy request key.
    db.exec('DELETE FROM checkout_fulfillment; DROP TABLE checkout_fulfillment;');
    await ensureShippingSchema(db);await ensureShippingSchema(db);
    const sql=readFileSync('docs/D1-ATUALIZACAO-0004.sql','utf8').replace(/[\r\n]+/g,' ');
    db.exec(sql);db.exec(sql);
    const [old]=await listCheckouts(db,user.id);
    assert.equal(old.fulfillment,'pickup');assert.equal(old.products_cents,2400);assert.equal(old.shipping_cents,0);
    assert.equal((await acceptCheckout(db,{},user,data)).created,false);
    assert.equal((await db.prepare("SELECT password_hash FROM users WHERE id='shipping'").first()).password_hash,'preserved-hash');
  } finally {db.close();}
});
