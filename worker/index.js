import { hashPassword, verifyPassword, randomToken, digest, sessionToken, sessionCookie } from './security.js';
import { databaseHealth } from './health.js';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const text = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value);
const requestKey = value => { if (!validId(value)) fail(400, 'Reenvie a solicitação com uma referência válida.'); return value; };
const cents = value => { if (!Number.isSafeInteger(value) || value < 100 || value > 1000000) fail(400, 'Informe um valor entre R$ 1 e R$ 10.000.'); return value; };
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role });
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
  return user;
}
async function createSession(request, db, user) {
  const token = randomToken();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= unixepoch()'),
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, unixepoch() + 604800)').bind(await digest(token), user.id),
  ]);
  return json({ user: publicUser(user) }, 200, { 'Set-Cookie': sessionCookie(request, token) });
}
async function rewards(db) { return (await db.prepare('SELECT * FROM rewards WHERE active = 1 ORDER BY cost').all()).results; }
async function account(db, user) {
  const rows = await db.batch([
    db.prepare('SELECT COALESCE(SUM(delta),0) AS balance FROM point_entries WHERE user_id = ?').bind(user.id),
    db.prepare('SELECT id, delta, description, created_at FROM point_entries WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 50').bind(user.id),
    db.prepare('SELECT id, amount_cents, customer_note, status, points, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 50').bind(user.id),
    db.prepare('SELECT r.id, r.points, r.status, r.created_at, w.title FROM redemptions r JOIN rewards w ON w.id = r.reward_id WHERE r.user_id = ? ORDER BY r.created_at DESC, r.rowid DESC LIMIT 50').bind(user.id),
  ]);
  return { user: publicUser(user), balance: rows[0].results[0].balance, entries: rows[1].results, orders: rows[2].results, redemptions: rows[3].results, rewards: await rewards(db) };
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
  if (!db) fail(503, 'O banco de créditos ainda não foi conectado.');
  if (!['GET', 'POST'].includes(method)) fail(405, 'Método não permitido.');
  if (method === 'POST' && request.headers.get('Origin') !== url.origin) fail(403, 'Origem da solicitação não permitida.');
  if (path === '/api/rewards' && method === 'GET') return json({ rewards: await rewards(db) });
  if (path === '/api/auth/register' && method === 'POST') {
    await rateLimit(request, db, 'register');
    const data = await body(request);
    const name = text(data.name, 80), email = text(data.email, 254).toLowerCase();
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Informe seu nome e um e-mail válido.');
    if (typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 128 || !data.password.trim()) fail(400, 'Use uma senha de 12 a 128 caracteres.');
    const user = { id: crypto.randomUUID(), name, email, role: 'customer' };
    const password = await hashPassword(data.password);
    try { await db.prepare('INSERT INTO users (id,name,email,password_hash) VALUES (?,?,?,?)').bind(user.id,name,email,password).run(); }
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
  if (path === '/api/orders' && method === 'POST') {
    const data = await body(request), key = requestKey(data.request_key), amount = cents(data.amount_cents);
    const existing = await db.prepare('SELECT id FROM orders WHERE user_id = ? AND request_key = ?').bind(user.id,key).first();
    if (existing) return json(existing);
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO orders (id,user_id,request_key,amount_cents,customer_note) VALUES (?,?,?,?,?) ON CONFLICT(user_id, request_key) DO NOTHING').bind(id,user.id,key,amount,text(data.note)).run();
    return json(await db.prepare('SELECT id FROM orders WHERE user_id = ? AND request_key = ?').bind(user.id,key).first(), 201);
  }
  if (path === '/api/redemptions' && method === 'POST') {
    const data = await body(request), key = requestKey(data.request_key);
    if (!validId(data.reward_id)) fail(400, 'Escolha um brinde válido.');
    const existing = await db.prepare('SELECT id, reward_id FROM redemptions WHERE user_id = ? AND request_key = ?').bind(user.id,key).first();
    if (existing) { if (existing.reward_id !== data.reward_id) fail(409, 'Referência já utilizada para outro brinde.'); return json(existing); }
    const id = crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT INTO redemptions (id,user_id,reward_id,request_key,points)
        SELECT ?,?,?,?,r.cost FROM rewards r WHERE r.id = ? AND r.active = 1 AND r.stock > 0
        AND (SELECT COALESCE(SUM(delta),0) FROM point_entries WHERE user_id = ?) >= r.cost
        ON CONFLICT(user_id,request_key) DO NOTHING`).bind(id,user.id,data.reward_id,key,data.reward_id,user.id),
      db.prepare('UPDATE rewards SET stock = stock - 1 WHERE id = ? AND EXISTS (SELECT 1 FROM redemptions WHERE id = ?)').bind(data.reward_id,id),
      db.prepare(`INSERT INTO point_entries (id,user_id,delta,description,redemption_id)
        SELECT ?,user_id,-points,'Resgate de brinde',id FROM redemptions WHERE id = ?`).bind(crypto.randomUUID(),id),
    ]);
    const redemption = await db.prepare('SELECT id FROM redemptions WHERE user_id = ? AND request_key = ?').bind(user.id,key).first();
    if (!redemption) fail(409, 'Saldo insuficiente ou brinde sem estoque. Atualize sua conta.');
    return json(redemption,201);
  }
  if (path.startsWith('/api/admin/')) {
    if (user.role !== 'admin') fail(403, 'Esta área é exclusiva da equipe Saints’.');
    if (path === '/api/admin/overview' && method === 'GET') {
      const orders = await db.prepare('SELECT o.*, u.name, u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY (o.status = \'pending\') DESC, o.created_at DESC LIMIT 100').all();
      const redemptions = await db.prepare('SELECT r.*, u.name, u.email, w.title FROM redemptions r JOIN users u ON u.id=r.user_id JOIN rewards w ON w.id=r.reward_id ORDER BY (r.status = \'pending\') DESC, r.created_at DESC LIMIT 100').all();
      return json({ orders: orders.results, redemptions: redemptions.results });
    }
    const orderMatch = path.match(/^\/api\/admin\/orders\/([a-f0-9-]+)\/(confirm|reject)$/);
    if (orderMatch && method === 'POST') {
      const [,id,action] = orderMatch;
      const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
      if (!order) fail(404, 'Compra não encontrada.');
      if (order.status !== 'pending') {
        if ((action === 'confirm' && order.status === 'confirmed') || (action === 'reject' && order.status === 'rejected')) return json({ status: order.status, points: order.points });
        fail(409, 'Esta compra já foi revisada. Atualize o painel.');
      }
      if (action === 'reject') {
        await db.prepare('UPDATE orders SET status=\'rejected\', reviewed_by=?, reviewed_at=unixepoch() WHERE id=? AND status=\'pending\'').bind(user.id,id).run();
        const current = await db.prepare('SELECT status FROM orders WHERE id=?').bind(id).first();
        if (current.status !== 'rejected') fail(409, 'Esta compra já foi confirmada. Atualize o painel.');
        return json({ status: 'rejected' });
      }
      const data = await body(request), amount = cents(data.amount_cents), reference = text(data.sale_reference,100).toLowerCase();
      if (reference.length < 3) fail(400, 'Informe uma referência única da compra, com pelo menos 3 caracteres.');
      const points = Math.floor(amount / 100);
      try {
        await db.batch([
          db.prepare(`UPDATE orders SET status='confirmed', amount_cents=?, sale_reference=?, points=?, reviewed_by=?, reviewed_at=unixepoch() WHERE id=? AND status='pending'`).bind(amount,reference,points,user.id,id),
          db.prepare(`INSERT INTO point_entries (id,user_id,delta,description,order_id)
            SELECT ?,user_id,points,'Compra confirmada pela equipe',id FROM orders WHERE id=? AND status='confirmed'
            ON CONFLICT(order_id) DO NOTHING`).bind(crypto.randomUUID(),id),
        ]);
      } catch (error) { if (String(error).includes('UNIQUE')) fail(409, 'Essa referência já foi usada em outra compra.'); throw error; }
      const current = await db.prepare('SELECT status, points FROM orders WHERE id = ?').bind(id).first();
      if (current.status !== 'confirmed') fail(409, 'Esta compra já foi rejeitada. Atualize o painel.');
      return json(current);
    }
    const redemptionMatch = path.match(/^\/api\/admin\/redemptions\/([a-f0-9-]+)\/fulfill$/);
    if (redemptionMatch && method === 'POST') {
      const result = await db.prepare('UPDATE redemptions SET status=\'fulfilled\', fulfilled_by=?, fulfilled_at=unixepoch() WHERE id=? AND status=\'pending\'').bind(user.id,redemptionMatch[1]).run();
      if (!result.meta.changes) {
        const exists = await db.prepare('SELECT id FROM redemptions WHERE id=?').bind(redemptionMatch[1]).first();
        if (!exists) fail(404, 'Resgate não encontrado.');
      }
      return json({ status: 'fulfilled' });
    }
  }
  fail(404, 'Página não encontrada.');
}

export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try { return await api(request,env); }
    catch (error) {
      if (error instanceof HttpError) return json({ error: error.message },error.status);
      // Do not log request bodies, credentials, or SQL values.
      console.error('Credit system request failed:', error.name || 'Error');
      return json({ error: 'Não foi possível concluir agora. Tente novamente.' },500);
    }
  },
};
