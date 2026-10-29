import { products } from '../src/products.js';
import { checkoutReady, profileFor, consentText } from './profile.js';
import { dispatchReceipt } from './whatsapp.js';

export class CheckoutError extends Error {
  constructor(status,message) { super(message); this.status = status; }
}
const reject = (status,message) => { throw new CheckoutError(status,message); };
export function priceCart(items) {
  if (!Array.isArray(items) || !items.length || items.length > products.length) reject(400,'Escolha pelo menos um cookie.');
  const seen = new Set();
  const priced = items.map(item => {
    const product = products.find(p => p.id === item?.id);
    if (!product || seen.has(product.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) reject(400,'Confira os sabores e quantidades da sacola.');
    seen.add(product.id);
    return { product_id:product.id,product_name:product.name,quantity:item.quantity,unit_cents:Math.round(product.price*100) };
  }).sort((a,b)=>a.product_id.localeCompare(b.product_id));
  const amount = priced.reduce((sum,item)=>sum+item.quantity*item.unit_cents,0);
  if (amount > 1000000) reject(400,'O pedido deve ter um valor de até R$ 10.000.');
  return { items:priced,amount_cents:amount };
}
const selection = `SELECT c.*,w.status AS whatsapp_status,w.error_code AS whatsapp_error,w.attempts,
  (SELECT json_group_array(json_object('product_id',i.product_id,'product_name',i.product_name,'quantity',i.quantity,'unit_cents',i.unit_cents)) FROM checkout_items i WHERE i.checkout_id=c.id) AS items_json
  FROM checkout_orders c JOIN whatsapp_outbox w ON w.checkout_id=c.id`;
const unpack = row => { const {items_json,...order} = row; return {...order,items:JSON.parse(items_json)}; };
export async function listCheckouts(db,userId) {
  if (!await checkoutReady(db)) return [];
  const result = userId
    ? await db.prepare(`${selection} WHERE c.user_id=? ORDER BY c.created_at DESC,c.rowid DESC LIMIT 50`).bind(userId).all()
    : await db.prepare(`${selection} ORDER BY c.created_at DESC,c.rowid DESC LIMIT 100`).all();
  return result.results.map(unpack);
}
export async function getCheckout(db,id) {
  const row = await db.prepare(`${selection} WHERE c.id=?`).bind(id).first();
  return row ? unpack(row) : null;
}
export async function acceptCheckout(db,env,user,data) {
  if (!await checkoutReady(db)) reject(503,'O fechamento está sendo preparado. Fale com a Saints’ para concluir sua encomenda.');
  if (typeof data.request_key !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(data.request_key)) reject(400,'Reabra o fechamento e tente novamente.');
  if (typeof data.whatsapp_consent !== 'boolean') reject(400,'Confira sua preferência de contato pelo WhatsApp.');
  const { items,amount_cents } = priceCart(data.items);
  const cartKey = JSON.stringify({ items:items.map(i=>[i.product_id,i.quantity]),consent:data.whatsapp_consent });
  const existing = await db.prepare('SELECT id,cart_key FROM checkout_orders WHERE user_id=? AND request_key=?').bind(user.id,data.request_key).first();
  if (existing) {
    if (existing.cart_key !== cartKey) reject(409,'Esta referência já foi usada. Atualize a página para preparar outro pedido.');
    // Replaying checkout retrieves the receipt; only staff can retry a failed send.
    return { order:await getCheckout(db,existing.id),created:false };
  }
  const profile = await profileFor(db,user.id);
  if (!profile) reject(400,'Complete seu telefone, endereço e pagamento preferido antes de fechar o pedido.');
  const id = crypto.randomUUID(), loyaltyId = crypto.randomUUID();
  const number = `SC-${id.replaceAll('-','').toUpperCase()}`;
  const note = `Pedido ${number} aceito no site; pagamento e pontos aguardam conferência.`;
  // D1 batch is atomic: order, immutable item/profile snapshots, pending loyalty
  // purchase and durable outbox are committed together, including concurrent retries.
  await db.batch([
    db.prepare(`INSERT INTO orders(id,user_id,request_key,amount_cents,customer_note)
      SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM checkout_orders WHERE user_id=? AND request_key=?)`)
      .bind(loyaltyId,user.id,`checkout-${id}`,amount_cents,note,user.id,data.request_key),
    db.prepare(`INSERT INTO checkout_orders(id,number,user_id,request_key,cart_key,loyalty_order_id,customer_name,phone,address,payment_preference,amount_cents,whatsapp_consent,consent_text)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=?) ON CONFLICT(user_id,request_key) DO NOTHING`)
      .bind(id,number,user.id,data.request_key,cartKey,loyaltyId,user.name,profile.phone,profile.address,profile.payment_preference,amount_cents,data.whatsapp_consent ? 1 : 0,consentText,loyaltyId),
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
