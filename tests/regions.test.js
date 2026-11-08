import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.js';
import {testDatabase} from './helpers/d1.js';
import {profileFor} from '../worker/profile.js';
import {acceptCheckout,listCheckouts} from '../worker/checkout.js';

const person={name:'Cliente da RA',email:'region@example.test',password:'Teste123',phone:'61987654321',address:'QE 12, conjunto A, casa 10, Brasília, DF',payment_preference:'pix',region_id:'guara'};
test('registration requires a valid RA and profile edits persist the new choice without exposing prices in profile data',async()=>{
  const db=testDatabase();try {
    let cookie='';
    const post=(path,data)=>worker.fetch(new Request(`https://test.example/api/${path}`,{method:'POST',headers:{Origin:'https://test.example','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)}),{DB:db});
    for(const region_id of [undefined,'unknown',{id:'guara'}]) {
      const response=await post('auth/register',{...person,region_id});
      assert.equal(response.status,400);assert.match((await response.json()).error,/região administrativa/);
    }
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM users').first()).n,0);
    const created=await post('auth/register',person);
    assert.equal(created.status,200);cookie=created.headers.get('Set-Cookie').split(';')[0];
    const user=(await created.json()).user;
    assert.equal((await profileFor(db,user.id)).region_id,'guara');
    assert.equal((await post('profile',{...person,region_id:'gama'})).status,200);
    const profile=await profileFor(db,user.id);
    assert.equal(profile.region_id,'gama');assert.equal(profile.region_name,'Gama');
    assert.ok(!Object.hasOwn(profile,'fee_cents'));
  } finally {db.close();}
});
test('region initialization is repeatable and leaves an old profile unassigned until its owner chooses a RA',async()=>{
  const db=testDatabase();try {
    await db.prepare("INSERT INTO users(id,name,email,password_hash) VALUES('old','Cliente antigo','old-ra@example.test','original-hash')").run();
    await db.prepare("INSERT INTO customer_profiles(user_id,phone,address,payment_preference) VALUES('old','5561999999999',?,'pix')").bind(person.address).run();
    db.exec('DROP TABLE customer_regions');
    const old=await profileFor(db,'old');assert.equal(old.region_id,null);assert.equal(old.address,person.address);
    const sql=readFileSync('docs/D1-ATUALIZACAO-0005.sql','utf8').replace(/[\r\n]+/g,' ');
    db.exec(sql);db.exec(sql);
    assert.equal((await profileFor(db,'old')).region_id,null);
    assert.equal((await db.prepare("SELECT password_hash FROM users WHERE id='old'").first()).password_hash,'original-hash');
  } finally {db.close();}
});
test('delivery uses the saved RA and a RA change cannot rewrite an old order or use its cheaper rate for a new one',async()=>{
  const db=testDatabase();try {
    const user={id:'ra-order',name:person.name};
    await db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)').bind(user.id,user.name,person.email,'original-hash').run();
    await db.prepare("INSERT INTO customer_profiles(user_id,phone,address,payment_preference) VALUES(?,'5561987654321',?,'pix')").bind(user.id,person.address).run();
    await db.prepare("INSERT INTO customer_regions(user_id,region_id) VALUES(?,'guara')").bind(user.id).run();
    const data={items:[{id:'brown-butter',quantity:1}],request_key:'first-ra-order',whatsapp_consent:false,fulfillment:{method:'delivery',region_id:'guara',address_confirmed:true,confirmed_address:person.address,expected_shipping_cents:1000}};
    const first=await acceptCheckout(db,{},user,data);
    await db.prepare("UPDATE customer_regions SET region_id='gama' WHERE user_id=?").bind(user.id).run();
    assert.equal((await acceptCheckout(db,{},user,data)).created,false);
    await assert.rejects(acceptCheckout(db,{},user,{...data,request_key:'second-ra-order'}),error=>error.status===400&&/região administrativa/.test(error.message));
    const next=await acceptCheckout(db,{},user,{...data,request_key:'second-ra-order',fulfillment:{...data.fulfillment,region_id:'gama',expected_shipping_cents:1800}});
    assert.equal(next.order.amount_cents,3000);assert.equal(next.order.region_name,'Gama');
    const old=(await listCheckouts(db,user.id)).find(o=>o.id===first.order.id);
    assert.equal(old.amount_cents,2200);assert.equal(old.region_name,'Guará');
  } finally {db.close();}
});
