import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptCheckout } from '../worker/checkout.js';
import { dispatchReceipt, whatsappWebhook, verifyWebhookSignature, templatePayload } from '../worker/whatsapp.js';
import { testDatabase } from './helpers/d1.js';

const env={WHATSAPP_ENABLED:'true',WHATSAPP_PHONE_NUMBER_ID:'12345',WHATSAPP_GRAPH_VERSION:'v25.0',WHATSAPP_TEMPLATE_NAME:'saints_pedido_aceito',WHATSAPP_TEMPLATE_LANGUAGE:'pt_BR',WHATSAPP_ACCESS_TOKEN:'fake-token-test-only',WHATSAPP_APP_SECRET:'fake-app-secret-test-only',WHATSAPP_VERIFY_TOKEN:'fake-verify-token-test-only'};
async function fixture(consent=true) {
  const db=testDatabase();
  await db.prepare("INSERT INTO users(id,name,email,password_hash) VALUES('customer','Cliente de teste','wa@example.test','not-a-password')").run();
  await db.prepare("INSERT INTO customer_profiles(user_id,phone,address,payment_preference) VALUES('customer','5511999999999','Rua de Teste, 123, São Paulo, SP','pix')").run();
  const {order}=await acceptCheckout(db,{}, {id:'customer',name:'Cliente de teste'}, {items:[{id:'classic',quantity:2}],request_key:crypto.randomUUID(),whatsapp_consent:consent});
  return {db,order};
}
const row=(db,id)=>db.prepare('SELECT * FROM whatsapp_outbox WHERE checkout_id=?').bind(id).first();
async function signature(raw) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.WHATSAPP_APP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw)));
  return 'sha256='+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
test('concurrent sends submit once, with eight template parameters and server-side bearer token',async()=>{
  const {db,order}=await fixture();let calls=0;
  try {
    const transport=async(url,options)=>{
      calls++;assert.equal(url,'https://graph.facebook.com/v25.0/12345/messages');
      assert.equal(options.headers.Authorization,`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`);
      const payload=JSON.parse(options.body);
      assert.equal(payload.to,'5511999999999');assert.equal(payload.template.components[0].parameters.length,8);
      assert.equal(payload.template.components[0].parameters[3].text,'R$ 24,00');
      return Response.json({messages:[{id:'wamid.test'}]});
    };
    await Promise.all([dispatchReceipt(db,env,order.id,transport),dispatchReceipt(db,env,order.id,transport)]);
    assert.equal(calls,1);assert.equal((await row(db,order.id)).status,'submitted');
    await dispatchReceipt(db,env,order.id,transport);assert.equal(calls,1);
    assert.ok(!JSON.stringify(templatePayload(env,order,order.items)).includes(env.WHATSAPP_ACCESS_TOKEN));
  } finally {db.close();}
});
test('unconfigured or opted-out messages never contact Meta',async()=>{
  for(const consent of [true,false]) {
    const {db,order}=await fixture(consent);let calls=0;
    try {
      await dispatchReceipt(db,consent?{}:env,order.id,async()=>{calls++;throw new Error('must not send');});
      assert.equal(calls,0);assert.equal((await row(db,order.id)).status,consent?'not_configured':'opted_out');
    } finally {db.close();}
  }
});
test('rejected and unknown outcomes preserve the accepted order; unknown sends are not repeated',async()=>{
  for(const type of ['rejected','timeout','malformed','server_error']) {
    const {db,order}=await fixture();let calls=0;
    try {
      await dispatchReceipt(db,env,order.id,async()=>{
        calls++;
        if(type==='timeout') throw new Error('simulated lost response');
        if(type==='server_error') return Response.json({error:{code:131000}},{status:500});
        return type==='rejected'?Response.json({error:{code:131030}},{status:400}):new Response('bad gateway',{status:502});
      });
      assert.equal((await row(db,order.id)).status,type==='rejected'?'failed':'uncertain');
      assert.equal((await db.prepare('SELECT status FROM checkout_orders WHERE id=?').bind(order.id).first()).status,'accepted');
      if(type!=='rejected') {await dispatchReceipt(db,env,order.id,async()=>{calls++;});assert.equal(calls,1);}
    } finally {db.close();}
  }
});
test('webhook verifies challenge/signatures and prevents late events from regressing delivered/read state',async()=>{
  const {db,order}=await fixture();
  try {
    await dispatchReceipt(db,env,order.id,async()=>Response.json({messages:[{id:'wamid.webhook'}]}));
    const challenge=await whatsappWebhook(new Request(`https://example.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${env.WHATSAPP_VERIFY_TOKEN}&hub.challenge=123`),{...env,DB:db});
    assert.equal(await challenge.text(),'123');
    const notify=async(status,signed=true)=>{
      const raw=JSON.stringify({entry:[{changes:[{value:{metadata:{phone_number_id:env.WHATSAPP_PHONE_NUMBER_ID},statuses:[{id:'wamid.webhook',status}]}}]}]});
      return whatsappWebhook(new Request('https://example.test/api/whatsapp/webhook',{method:'POST',body:raw,headers:{'X-Hub-Signature-256':signed?await signature(raw):'sha256='+'0'.repeat(64)}}),{...env,DB:db});
    };
    assert.equal((await notify('delivered',false)).status,403);
    assert.equal((await row(db,order.id)).status,'submitted');
    await notify('read');await notify('delivered');await notify('failed');
    assert.equal((await row(db,order.id)).status,'read');
    assert.equal(await verifyWebhookSignature('{}','sha256=bad',env.WHATSAPP_APP_SECRET),false);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM point_entries').first()).n,0);
  } finally {db.close();}
});
