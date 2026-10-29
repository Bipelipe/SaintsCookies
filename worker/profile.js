export const payments = { pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', cash: 'Dinheiro' };
export const consentText = 'Autorizo a Saints’ Cookies a enviar a confirmação e atualizações deste pedido ao meu WhatsApp.';

export function validateProfile(data) {
  const phone = typeof data.phone === 'string' ? data.phone.replace(/[\s()+.-]/g, '') : '';
  const normalized = /^\d{10,11}$/.test(phone) ? `55${phone}` : phone;
  if (!/^55[1-9]\d(?:9\d{8}|[2-5]\d{7})$/.test(normalized)) throw new Error('Informe um telefone brasileiro válido, com DDD.');
  const address = typeof data.address === 'string' ? data.address.trim() : '';
  if (address.length < 10 || address.length > 400 || /[\x00-\x1f]/.test(address)) throw new Error('Informe seu endereço completo, entre 10 e 400 caracteres.');
  if (!Object.hasOwn(payments, data.payment_preference)) throw new Error('Escolha sua forma preferida de pagamento.');
  return { phone: normalized, address, payment_preference: data.payment_preference };
}
export async function checkoutReady(db) {
  const row = await db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN ('customer_profiles','checkout_orders','checkout_items','whatsapp_outbox')").first();
  return row.total === 4;
}
export async function profileFor(db, userId) {
  if (!await checkoutReady(db)) return null;
  return db.prepare('SELECT phone,address,payment_preference FROM customer_profiles WHERE user_id=?').bind(userId).first();
}
