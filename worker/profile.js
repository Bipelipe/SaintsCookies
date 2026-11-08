import { shippingRegions } from '../src/shipping.js';
import { ensureRegionSchema } from './region-schema.js';
export const payments = { pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', cash: 'Dinheiro' };
// Keep historical order labels above; only these methods are offered now.
export const availablePayment = value => value === 'pix' || value === 'cash';
export const consentText = 'Autorizo a Saints’ Cookies a enviar a confirmação e atualizações deste pedido ao meu WhatsApp.';

export function validateProfile(data) {
  const phone = typeof data.phone === 'string' ? data.phone.replace(/[\s()+.-]/g, '') : '';
  const normalized = /^\d{10,11}$/.test(phone) ? `55${phone}` : phone;
  if (!/^55[1-9]\d(?:9\d{8}|[2-5]\d{7})$/.test(normalized)) throw new Error('Informe um telefone brasileiro válido, com DDD.');
  const address = typeof data.address === 'string' ? data.address.trim() : '';
  if (address.length < 10 || address.length > 400 || /[\x00-\x1f]/.test(address)) throw new Error('Informe seu endereço completo, entre 10 e 400 caracteres.');
  if (!availablePayment(data.payment_preference)) throw new Error('Escolha Pix ou Dinheiro como forma preferida de pagamento.');
  if (!shippingRegions.some(region=>region.id===data.region_id)) throw new Error('Selecione a região administrativa do seu endereço no Distrito Federal.');
  return { phone: normalized, address, region_id:data.region_id, payment_preference: data.payment_preference };
}
export async function checkoutReady(db) {
  const row = await db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN ('customer_profiles','checkout_orders','checkout_items','whatsapp_outbox')").first();
  return row.total === 4;
}
export async function profileFor(db, userId) {
  if (!await checkoutReady(db)) return null;
  await ensureRegionSchema(db);
  const profile=await db.prepare('SELECT p.phone,p.address,p.payment_preference,p.updated_at,r.region_id FROM customer_profiles p LEFT JOIN customer_regions r ON r.user_id=p.user_id WHERE p.user_id=?').bind(userId).first();
  return profile ? {...profile,region_name:shippingRegions.find(region=>region.id===profile.region_id)?.name||null} : null;
}
