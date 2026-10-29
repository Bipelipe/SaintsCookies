import { payments } from './profile.js';

export function whatsappConfigured(env) {
  return env.WHATSAPP_ENABLED === 'true' && /^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID || '')
    && /^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_VERSION || '')
    && /^[a-z0-9_]+$/.test(env.WHATSAPP_TEMPLATE_NAME || '')
    && /^[a-z]{2}(?:_[A-Z]{2})?$/.test(env.WHATSAPP_TEMPLATE_LANGUAGE || '')
    && Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_APP_SECRET && env.WHATSAPP_VERIFY_TOKEN);
}
export function templatePayload(env, order, items) {
  const values = [order.customer_name, order.number,
    items.map(i => `${i.quantity}x ${i.product_name}`).join('; '),
    (order.amount_cents / 100).toLocaleString('pt-BR', { style:'currency',currency:'BRL' }),
    payments[order.payment_preference], 'Retirada com a Saints’', order.address, `Aceito; ${{pending:'pagamento pendente',confirmed:'pagamento conferido pela equipe',not_approved:'pagamento não confirmado'}[order.payment_status]}`];
  return { messaging_product:'whatsapp', to:order.phone, type:'template',
    template:{ name:env.WHATSAPP_TEMPLATE_NAME, language:{ code:env.WHATSAPP_TEMPLATE_LANGUAGE },
      components:[{ type:'body',parameters:values.map(value => ({ type:'text',text:value.replace(/[\r\n\t]+/g,' ').slice(0,900) })) }] } };
}
// A claimed outbox row prevents concurrent clicks from sending twice. Unknown
// delivery outcomes are never retried automatically: Meta has no idempotency key.
export async function dispatchReceipt(db, env, checkoutId, transport = fetch) {
  const order = await db.prepare('SELECT * FROM checkout_orders WHERE id=?').bind(checkoutId).first();
  if (!order || !order.whatsapp_consent) return;
  if (!whatsappConfigured(env)) {
    await db.prepare("UPDATE whatsapp_outbox SET status='not_configured',updated_at=unixepoch() WHERE checkout_id=? AND status IN ('pending','failed','not_configured')").bind(checkoutId).run();
    return;
  }
  const claim = await db.prepare("UPDATE whatsapp_outbox SET status='sending',attempts=attempts+1,message_id=NULL,error_code=NULL,updated_at=unixepoch() WHERE checkout_id=? AND status IN ('pending','failed','not_configured') RETURNING checkout_id").bind(checkoutId).first();
  if (!claim) return;
  try {
    const items = (await db.prepare('SELECT * FROM checkout_items WHERE checkout_id=? ORDER BY product_id').bind(checkoutId).all()).results;
    const response = await transport(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method:'POST', headers:{ Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json' },
      body:JSON.stringify(templatePayload(env,order,items)), signal:AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => null);
    const messageId = result?.messages?.[0]?.id;
    if (response.ok && typeof messageId === 'string' && messageId.length < 250) {
      await db.prepare("UPDATE whatsapp_outbox SET status='submitted',message_id=?,updated_at=unixepoch() WHERE checkout_id=? AND status='sending'").bind(messageId,checkoutId).run();
    } else {
      // Only a structured Meta rejection proves the message was not accepted.
      const rejected = response.status >= 400 && response.status < 500 && Number.isInteger(result?.error?.code);
      await db.prepare('UPDATE whatsapp_outbox SET status=?,error_code=?,updated_at=unixepoch() WHERE checkout_id=? AND status=\'sending\'')
        .bind(rejected ? 'failed' : 'uncertain', rejected ? `meta_${result.error.code}` : 'unknown_result',checkoutId).run();
    }
  } catch {
    await db.prepare("UPDATE whatsapp_outbox SET status='uncertain',error_code='unknown_result',updated_at=unixepoch() WHERE checkout_id=? AND status='sending'").bind(checkoutId).run();
  }
}

export async function verifyWebhookSignature(raw, signature, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature || '')) return false;
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{ name:'HMAC',hash:'SHA-256' },false,['verify']);
  const bytes = Uint8Array.from(signature.slice(7).match(/../g),pair => parseInt(pair,16));
  return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(raw));
}
export async function whatsappWebhook(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    if (!env.WHATSAPP_VERIFY_TOKEN || url.searchParams.get('hub.mode') !== 'subscribe' || url.searchParams.get('hub.verify_token') !== env.WHATSAPP_VERIFY_TOKEN) return new Response('Forbidden',{status:403});
    return new Response(url.searchParams.get('hub.challenge') || '',{headers:{'Cache-Control':'no-store'}});
  }
  if (request.method !== 'POST') return new Response('Method not allowed',{status:405});
  const reader = request.body?.getReader();
  if (!reader) return new Response('Bad request',{status:400});
  const chunks = []; let size = 0;
  while (true) {
    const {done,value} = await reader.read(); if(done) break;
    size += value.byteLength;
    if(size > 65536) { await reader.cancel(); return new Response('Too large',{status:413}); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for(const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  const raw = new TextDecoder().decode(bytes);
  if (!await verifyWebhookSignature(raw,request.headers.get('X-Hub-Signature-256'),env.WHATSAPP_APP_SECRET)) return new Response('Forbidden',{status:403});
  let data; try { data = JSON.parse(raw); } catch { return new Response('Bad request',{status:400}); }
  for (const entry of (Array.isArray(data?.entry) ? data.entry : [])) {
    for (const change of (Array.isArray(entry?.changes) ? entry.changes : [])) {
      if (change?.value?.metadata?.phone_number_id !== env.WHATSAPP_PHONE_NUMBER_ID) continue;
      for (const update of (Array.isArray(change.value?.statuses) ? change.value.statuses : [])) {
        if (!['delivered','read','failed'].includes(update?.status) || typeof update.id !== 'string') continue;
        const allowed = update.status === 'read' ? ['submitted','delivered','failed'] : ['submitted'];
        await env.DB.prepare(`UPDATE whatsapp_outbox SET status=?,error_code=?,updated_at=unixepoch() WHERE message_id=? AND status IN (${allowed.map(()=>'?').join(',')})`)
          .bind(update.status,update.status === 'failed' ? 'delivery_failed' : null,update.id,...allowed).run();
      }
    }
  }
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}
