import { ensureShippingSchema } from './shipping-schema.js';
import { shippingRegions } from '../src/shipping.js';
import { hashPassword, verifyPassword, randomToken, digest, sessionToken, sessionCookie } from './security.js';
import { validNewPassword, passwordHelp } from '../src/password-policy.js';
import { databaseHealth } from './health.js';
import { effectiveUser,capabilities } from './roles.js';
import { administration,AdminError } from './admin.js';
import { validateProfile, profileFor, checkoutReady } from './profile.js';
import { CheckoutError, acceptCheckout, listCheckouts } from './checkout.js';
import { dispatchReceipt, whatsappConfigured, whatsappWebhook } from './whatsapp.js';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const text = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role, permissions:capabilities(user.role) });
async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail(415, 'Envie dados em JSON.');
  if (Number(request.headers.get('Content-Length')) > 8192) fail(413, 'Solicitação muito grande.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Dados inválidos.');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); fail(413, 'Solicitação muito grande.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  const raw = new TextDecoder().decode(bytes);
  try { const parsed = JSON.parse(raw); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); return parsed; }
  catch { fail(400, 'Dados inválidos.'); }
}
async function rateLimit(request, db, action) {
  const key = await digest(`${action}:${request.headers.get('CF-Connecting-IP') || 'local'}`);
  const window = Math.floor(Date.now() / 600000);
  const row = await db.prepare('INSERT INTO rate_limits (key, window, attempts) VALUES (?, ?, 1) ON CONFLICT(key, window) DO UPDATE SET attempts = attempts + 1 RETURNING attempts').bind(key, window).first();
  if (row.attempts > 20) fail(429, 'Muitas tentativas. Tente novamente em 10 minutos.');
  await db.prepare('DELETE FROM rate_limits WHERE window < ?').bind(window - 1).run();
}
async function currentUser(request, db) {
  const token = sessionToken(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) fail(401, 'Entre na sua conta para continuar.');
  const user = await db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > unixepoch()').bind(await digest(token)).first();
  if (!user) fail(401, 'Sua sessão expirou. Entre novamente.');
  return effectiveUser(db,user);
}
async function createSession(request, db, user) {
  const token = randomToken();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= unixepoch()'),
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, unixepoch() + 604800)').bind(await digest(token), user.id),
  ]);
  return json({ user: publicUser(await effectiveUser(db,user)) }, 200, { 'Set-Cookie': sessionCookie(request, token) });
}
async function account(db, user) {
  return { user: publicUser(user), profile: await profileFor(db,user.id), checkouts: await listCheckouts(db,user.id) };
}
async function api(request, env) {
  const db = env.DB;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  const method = request.method;
  if (path === '/api/health' && method === 'GET') {
    const health = await databaseHealth(env);
    return json(health.data,health.status);
  }
  if (!db) fail(503, 'O banco do site ainda não foi conectado.');
  if (path === '/api/whatsapp/webhook') return whatsappWebhook(request,env);
  if (!['GET', 'POST'].includes(method)) fail(405, 'Método não permitido.');
  if (method === 'POST' && request.headers.get('Origin') !== url.origin) fail(403, 'Origem da solicitação não permitida.');
  if (path === '/api/checkout/config' && method === 'GET') {
    const ready=await checkoutReady(db);
    if(ready) await ensureShippingSchema(db);
    return json({ready,whatsapp_enabled:whatsappConfigured(env),shipping_test:true,shipping_regions:shippingRegions});
  }
  if (path === '/api/auth/register' && method === 'POST') {
    await rateLimit(request, db, 'register');
    const data = await body(request);
    const name = text(data.name, 80), email = text(data.email, 254).toLowerCase();
    if (name.length < 2 || /[\x00-\x1f]/.test(name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Informe seu nome e um e-mail válido.');
    if (!validNewPassword(data.password)) fail(400, passwordHelp);
    if (!await checkoutReady(db)) fail(503,'O cadastro está sendo preparado. Tente novamente mais tarde ou fale com a Saints’.');
    let profile; try { profile = validateProfile(data); } catch (error) { fail(400,error.message); }
    const user = { id: crypto.randomUUID(), name, email, role: 'customer' };
    const password = await hashPassword(data.password);
    try { await db.batch([
      db.prepare('INSERT INTO users (id,name,email,password_hash) VALUES (?,?,?,?)').bind(user.id,name,email,password),
      db.prepare('INSERT INTO customer_profiles(user_id,phone,address,payment_preference) VALUES (?,?,?,?)').bind(user.id,profile.phone,profile.address,profile.payment_preference),
    ]); }
    catch (error) { if (String(error).includes('UNIQUE')) fail(409, 'Já existe uma conta com esse e-mail. Entre na sua conta.'); throw error; }
    return createSession(request, db, user);
  }
  if (path === '/api/auth/login' && method === 'POST') {
    await rateLimit(request, db, 'login');
    const data = await body(request);
    const email = text(data.email,254).toLowerCase();
    if (typeof data.password !== 'string' || data.password.length > 128) fail(401, 'E-mail ou senha incorretos.');
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    const fallback = 'pbkdf2-sha256$100000$00000000000000000000000000000000$' + '0'.repeat(64);
    const verified = await verifyPassword(data.password, user?.password_hash || fallback);
    if (!user || !verified) fail(401, 'E-mail ou senha incorretos.');
    return createSession(request, db, user);
  }
  const user = await currentUser(request, db);
  if (path === '/api/auth/logout' && method === 'POST') {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await digest(sessionToken(request))).run();
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
  }
  if (path === '/api/account' && method === 'GET') return json(await account(db, user));
  if (path === '/api/profile' && method === 'POST') {
    if (!await checkoutReady(db)) fail(503,'A atualização de dados ainda está sendo preparada. Fale com a Saints’.');
    const data = await body(request);
    let profile; try { profile = validateProfile(data); } catch (error) { fail(400,error.message); }
    const name = text(data.name,80);
    if (name.length < 2 || /[\x00-\x1f]/.test(name)) fail(400,'Informe seu nome completo.');
    await db.batch([
      db.prepare('UPDATE users SET name=? WHERE id=?').bind(name,user.id),
      db.prepare(`INSERT INTO customer_profiles(user_id,phone,address,payment_preference) VALUES (?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,address=excluded.address,payment_preference=excluded.payment_preference,updated_at=unixepoch()`)
        .bind(user.id,profile.phone,profile.address,profile.payment_preference),
    ]);
    return json({ok:true});
  }
  if (path === '/api/checkout' && method === 'POST') {
    await rateLimit(request,db,'checkout');
    const result = await acceptCheckout(db,env,user,await body(request));
    return json({order:result.order},result.created ? 201 : 200);
  }
  if (path.startsWith('/api/admin/')) {
    const operational = (path==='/api/admin/overview'&&method==='GET') || (/^\/api\/admin\/checkouts\/[a-f0-9-]+\/(confirm-payment|retry)$/.test(path)&&method==='POST');
    if (user.role !== 'admin' && !(user.role==='owner'&&operational)) fail(403, 'Esta área é exclusiva da equipe autorizada Saints’.');
    const result=await administration(request,db,user,body);
    if(result!==null) return json(result);
    if (path === '/api/admin/overview' && method === 'GET') {
      return json({ checkouts:await listCheckouts(db), whatsapp_enabled:whatsappConfigured(env) });
    }
    const retryMatch = path.match(/^\/api\/admin\/checkouts\/([a-f0-9-]+)\/retry$/);
    if (retryMatch && method === 'POST') {
      await rateLimit(request,db,'whatsapp-retry');
      const data = await body(request);
      const row = await db.prepare('SELECT status,updated_at FROM whatsapp_outbox WHERE checkout_id=?').bind(retryMatch[1]).first();
      if (!row) fail(404,'Pedido não encontrado.');
      if (row.status === 'opted_out') fail(409,'O cliente não autorizou o contato pelo WhatsApp.');
      if (row.status === 'sending' && row.updated_at > Date.now()/1000-300) fail(409,'O envio ainda está em andamento. Atualize o painel em alguns minutos.');
      if (['uncertain','sending'].includes(row.status)) {
        if (data.acknowledge_duplicate_risk !== true) fail(409,'Confira a conversa antes de reenviar: o cliente pode já ter recebido a mensagem.');
        await db.prepare("UPDATE whatsapp_outbox SET status='failed' WHERE checkout_id=? AND status=?").bind(retryMatch[1],row.status).run();
      }
      await dispatchReceipt(db,env,retryMatch[1]);
      return json({ok:true});
    }
    const paymentMatch = path.match(/^\/api\/admin\/checkouts\/([a-f0-9-]+)\/confirm-payment$/);
    if (paymentMatch && method === 'POST') {
      await body(request);
      const id = paymentMatch[1];
      const order = await db.prepare('SELECT id,loyalty_order_id,payment_status FROM checkout_orders WHERE id=?').bind(id).first();
      if (!order) fail(404,'Pedido não encontrado.');
      if (order.payment_status === 'confirmed') return json({payment_status:'confirmed'});
      if (order.payment_status === 'not_approved') fail(409,'Este pagamento já foi revisado. Fale com a equipe para conferir o pedido.');
      // Keep the existing order relation for database compatibility. Payment
      // confirmation only updates payment records; it never awards points.
      await db.batch([
        db.prepare("UPDATE orders SET status='confirmed',sale_reference=?,reviewed_by=?,reviewed_at=unixepoch() WHERE id=? AND status='pending'")
          .bind(`web-${id}`,user.id,order.loyalty_order_id),
        db.prepare("UPDATE checkout_orders SET payment_status='confirmed' WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='confirmed')")
          .bind(id,order.loyalty_order_id),
      ]);
      const current = await db.prepare('SELECT payment_status FROM checkout_orders WHERE id=?').bind(id).first();
      if (current.payment_status !== 'confirmed') fail(409,'Não foi possível confirmar este pagamento. Atualize o painel.');
      return json(current);
    }
  }
  fail(404, 'Página não encontrada.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (['/creditos','/creditos.html'].includes(url.pathname)) {
      url.pathname='/conta';
      return Response.redirect(url.toString(),302);
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try { return await api(request,env); }
    catch (error) {
      if (error instanceof HttpError || error instanceof CheckoutError || error instanceof AdminError) return json({ error: error.message },error.status);
      // Do not log request bodies, credentials, or SQL values.
      console.error('Account request failed:', error.name || 'Error');
      return json({ error: 'Não foi possível concluir agora. Tente novamente.' },500);
    }
  },
};
