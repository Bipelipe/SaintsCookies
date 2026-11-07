import { products,productLabel } from '../src/products.js';
import { checkoutReady, profileFor, consentText, availablePayment } from './profile.js';
import { shippingQuote } from '../src/shipping.js';
import { ensureShippingSchema } from './shipping-schema.js';
import { dispatchReceipt } from './whatsapp.js';

export class CheckoutError extends Error {
  constructor(status,message) { super(message); this.status = status; }
}
const reject = (status,message) => { throw new CheckoutError(status,message); };
function normalizeSelection(items) {
  if(!Array.isArray(items)||!items.length||items.length>100) reject(400,'Escolha pelo menos um produto.');
  const seen=new Set();
  return items.map(item=>{
    if(typeof item?.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(item.id)||seen.has(item.id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99) reject(400,'Confira os sabores e quantidades da sacola.');
    seen.add(item.id);return {id:item.id,quantity:item.quantity};
  }).sort((a,b)=>a.id.localeCompare(b.id));
}
export function priceCart(items) {
  const priced = normalizeSelection(items).map(item => {
    const product = products.find(p => p.id === item.id);
    if (!product) reject(400,'Este produto não faz parte do cardápio atual. Atualize a sacola e escolha seus sabores.');
    return { product_id:product.id,product_name:productLabel(product),quantity:item.quantity,unit_cents:Math.round(product.price*100) };
  });
  const amount = priced.reduce((sum,item)=>sum+item.quantity*item.unit_cents,0);
  if (amount > 1000000) reject(400,'O pedido deve ter um valor de até R$ 10.000.');
  return { items:priced,amount_cents:amount };
}
const selection = `SELECT c.*,COALESCE(f.method,'pickup') AS fulfillment_method,COALESCE(f.products_cents,c.amount_cents) AS products_cents,COALESCE(f.shipping_cents,0) AS shipping_cents,f.region_id,f.region_name,f.delivery_address,f.address_confirmed_at,w.status AS whatsapp_status,w.error_code AS whatsapp_error,w.attempts,
  (SELECT json_group_array(json_object('product_id',i.product_id,'product_name',i.product_name,'quantity',i.quantity,'unit_cents',i.unit_cents)) FROM checkout_items i WHERE i.checkout_id=c.id) AS items_json
  FROM checkout_orders c JOIN whatsapp_outbox w ON w.checkout_id=c.id LEFT JOIN checkout_fulfillment f ON f.checkout_id=c.id`;
const unpack = row => { const {items_json,loyalty_order_id,fulfillment_method,...order} = row; return {...order,fulfillment:fulfillment_method,items:JSON.parse(items_json)}; };
export async function listCheckouts(db,userId) {
  if (!await checkoutReady(db)) return [];
  await ensureShippingSchema(db);
  const result = userId
    ? await db.prepare(`${selection} WHERE c.user_id=? ORDER BY c.created_at DESC,c.rowid DESC LIMIT 50`).bind(userId).all()
    : await db.prepare(`${selection} ORDER BY c.created_at DESC,c.rowid DESC LIMIT 100`).all();
  return result.results.map(unpack);
}
export async function getCheckout(db,id) {
  await ensureShippingSchema(db);
  const row = await db.prepare(`${selection} WHERE c.id=?`).bind(id).first();
  return row ? unpack(row) : null;
}
export async function acceptCheckout(db,env,user,data) {
  if (!await checkoutReady(db)) reject(503,'O fechamento está sendo preparado. Fale com a Saints’ para concluir sua encomenda.');
  if (typeof data.request_key !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(data.request_key)) reject(400,'Reabra o fechamento e tente novamente.');
  if (typeof data.whatsapp_consent !== 'boolean') reject(400,'Confira sua preferência de contato pelo WhatsApp.');
  const selected=normalizeSelection(data.items);
  const fulfillment=data.fulfillment ?? {method:'pickup'};
  if (!fulfillment || !['pickup','delivery'].includes(fulfillment.method)) reject(400,'Escolha retirar na loja ou receber em casa.');
  if (fulfillment.method==='delivery' && (typeof fulfillment.region_id!=='string'||fulfillment.region_id.length>80||fulfillment.address_confirmed!==true||typeof fulfillment.confirmed_address!=='string'||fulfillment.confirmed_address.length>400)) reject(400,'Selecione sua região e confirme o endereço de entrega.');
  const cartKey = JSON.stringify({ items:selected.map(i=>[i.id,i.quantity]),consent:data.whatsapp_consent,
    ...(fulfillment.method==='delivery'?{fulfillment:{method:'delivery',region_id:fulfillment.region_id,confirmed_address:fulfillment.confirmed_address}}:{}) });
  await ensureShippingSchema(db);
  const existing = await db.prepare('SELECT id,cart_key FROM checkout_orders WHERE user_id=? AND request_key=?').bind(user.id,data.request_key).first();
  if (existing) {
    if (existing.cart_key !== cartKey) reject(409,'Esta referência já foi usada. Atualize a página para preparar outro pedido.');
    // Replaying checkout retrieves the receipt; only staff can retry a failed send.
    return { order:await getCheckout(db,existing.id),created:false };
  }
  const { items,amount_cents:products_cents } = priceCart(selected);
  const profile = await profileFor(db,user.id);
  if (!profile) reject(400,'Complete seu telefone, endereço e pagamento preferido antes de fechar o pedido.');
  if (!availablePayment(profile.payment_preference)) reject(400,'Atualize seus dados e escolha Pix ou Dinheiro antes de fechar o pedido.');
  const quote=shippingQuote(fulfillment);
  if (!quote) reject(400,'Escolha uma região administrativa do Distrito Federal.');
  if (fulfillment.method==='delivery' && fulfillment.confirmed_address!==profile.address) reject(400,'Seu endereço foi atualizado. Confira e confirme novamente antes de concluir.');
  if (fulfillment.method==='delivery' && fulfillment.expected_shipping_cents!==quote.fee_cents) reject(400,'O frete foi atualizado. Recarregue a página e confira o total.');
  const amount_cents=products_cents+quote.fee_cents;
  if (amount_cents>1000000) reject(400,'O total do pedido com frete deve ser de até R$ 10.000.');
  const id = crypto.randomUUID(), paymentRecordId = crypto.randomUUID();
  const number = `SC-${id.replaceAll('-','').toUpperCase()}`;
  const note = `Pedido ${number} aceito no site; pagamento aguarda conferência.`;
  // D1 batch is atomic: order, immutable item/profile snapshots, pending payment
  // record and durable outbox are committed together, including concurrent retries.
  await db.batch([
    db.prepare(`INSERT INTO orders(id,user_id,request_key,amount_cents,customer_note)
      SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM checkout_orders WHERE user_id=? AND request_key=?)`)
      .bind(paymentRecordId,user.id,`checkout-${id}`,amount_cents,note,user.id,data.request_key),
    db.prepare(`INSERT INTO checkout_orders(id,number,user_id,request_key,cart_key,loyalty_order_id,customer_name,phone,address,payment_preference,amount_cents,whatsapp_consent,consent_text)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=?) ON CONFLICT(user_id,request_key) DO NOTHING`)
      .bind(id,number,user.id,data.request_key,cartKey,paymentRecordId,user.name,profile.phone,profile.address,profile.payment_preference,amount_cents,data.whatsapp_consent ? 1 : 0,consentText,paymentRecordId),
    db.prepare(`INSERT INTO checkout_fulfillment(checkout_id,method,products_cents,shipping_cents,region_id,region_name,delivery_address,address_confirmed_at)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM checkout_orders WHERE id=?)`)
      .bind(id,fulfillment.method,products_cents,quote.fee_cents,quote.region?.id||null,quote.region?.name||null,
        fulfillment.method==='delivery'?profile.address:null,fulfillment.method==='delivery'?Math.floor(Date.now()/1000):null,id),
    ...items.map(item => db.prepare(`INSERT INTO checkout_items(checkout_id,product_id,product_name,quantity,unit_cents)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM checkout_orders WHERE id=?)`)
      .bind(id,item.product_id,item.product_name,item.quantity,item.unit_cents,id)),
    db.prepare(`INSERT INTO whatsapp_outbox(checkout_id,status)
      SELECT ?,? WHERE EXISTS(SELECT 1 FROM checkout_orders WHERE id=?)`).bind(id,data.whatsapp_consent ? 'pending' : 'opted_out',id),
  ]);
  const saved = await db.prepare('SELECT id,cart_key FROM checkout_orders WHERE user_id=? AND request_key=?').bind(user.id,data.request_key).first();
  if (saved.cart_key !== cartKey) reject(409,'Esta referência já foi usada para outro pedido.');
  if (saved.id === id) {
    // Delivery failure never changes whether the order has been accepted.
    try { await dispatchReceipt(db,env,id); } catch { /* outbox remains available for staff review */ }
  }
  return { order:await getCheckout(db,saved.id),created:saved.id === id };
}
