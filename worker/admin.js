import { rolesReady,roleNames } from './roles.js';
import { ensureShippingSchema } from './shipping-schema.js';
import { getCheckout } from './checkout.js';

export class AdminError extends Error {
  constructor(status,message) { super(message);this.status=status; }
}
const fail=(status,message)=>{throw new AdminError(status,message);};
const role="COALESCE(ar.role,u.role)";
const userSelect=`SELECT u.id,u.name,u.email,u.created_at,${role} AS role,p.phone,p.payment_preference,
  (SELECT COUNT(*) FROM checkout_orders c WHERE c.user_id=u.id) AS order_count,
  (SELECT COALESCE(SUM(c.amount_cents),0) FROM checkout_orders c WHERE c.user_id=u.id AND c.payment_status='confirmed') AS paid_cents
  FROM users u LEFT JOIN account_roles ar ON ar.user_id=u.id LEFT JOIN customer_profiles p ON p.user_id=u.id`;
const orderSelect=`SELECT c.id,c.number,c.user_id,c.customer_name,c.phone,c.address,c.payment_preference,COALESCE(f.method,'pickup') AS fulfillment,COALESCE(f.products_cents,c.amount_cents) AS products_cents,COALESCE(f.shipping_cents,0) AS shipping_cents,f.region_name,f.delivery_address,c.amount_cents,c.status,c.payment_status,c.created_at,w.status AS whatsapp_status
  FROM checkout_orders c JOIN whatsapp_outbox w ON w.checkout_id=c.id LEFT JOIN checkout_fulfillment f ON f.checkout_id=c.id`;
function pagination(params) {
  const page=Number(params.get('page')||1),limit=Number(params.get('limit')||20);
  if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isInteger(limit)||limit<1||limit>50) fail(400,'Escolha uma página e uma quantidade de registros válidas.');
  return {page,limit,offset:(page-1)*limit};
}
async function userDetail(db,id) {
  const user=await db.prepare(`${userSelect} WHERE u.id=?`).bind(id).first();
  if(!user) fail(404,'Conta não encontrada.');
  const profile=await db.prepare('SELECT phone,address,payment_preference,updated_at FROM customer_profiles WHERE user_id=?').bind(id).first();
  return {user,profile};
}
export async function changeRole(db,actor,userId,data) {
  if(actor.role!=='admin') fail(403,'A administração de contas é exclusiva do admin.');
  if(!Object.hasOwn(roleNames,data.role)||!Object.hasOwn(roleNames,data.expected_role)) fail(400,'Escolha um cargo válido e atualize a lista antes de alterar.');
  if(actor.id===userId && data.role!=='admin') fail(409,'Você não pode remover seu próprio acesso de admin pelo painel.');
  const current=await db.prepare(`SELECT ${role} AS role FROM users u LEFT JOIN account_roles ar ON ar.user_id=u.id WHERE u.id=?`).bind(userId).first();
  if(!current) fail(404,'Conta não encontrada.');
  if(current.role!==data.expected_role) fail(409,'O cargo desta conta mudou. Atualize a lista antes de continuar.');
  if(current.role===data.role) return {ok:true,role:data.role};
  const id=crypto.randomUUID();
  // Recheck actor, target and remaining admins inside the write transaction.
  // A concurrent request cannot demote both admins or use revoked privileges.
  await db.batch([
    db.prepare(`INSERT INTO account_roles(user_id,role,changed_by,change_id)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM users u LEFT JOIN account_roles ar ON ar.user_id=u.id WHERE u.id=? AND ${role}='admin')
      AND EXISTS(SELECT 1 FROM users u LEFT JOIN account_roles ar ON ar.user_id=u.id WHERE u.id=? AND ${role}=?)
      AND (?!='admin' OR ?='admin' OR (SELECT COUNT(*) FROM users u LEFT JOIN account_roles ar ON ar.user_id=u.id WHERE ${role}='admin')>1)
      ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,changed_by=excluded.changed_by,change_id=excluded.change_id,updated_at=unixepoch()`)
      .bind(userId,data.role,actor.id,id,actor.id,userId,data.expected_role,data.expected_role,data.role),
    db.prepare(`INSERT INTO role_changes(id,user_id,previous_role,new_role,changed_by)
      SELECT ?,user_id,?,role,changed_by FROM account_roles WHERE user_id=? AND change_id=?`).bind(id,data.expected_role,userId,id),
  ]);
  const applied=await db.prepare('SELECT role FROM account_roles WHERE user_id=? AND change_id=?').bind(userId,id).first();
  if(!applied) fail(409,'A alteração não foi aplicada. Preserve ao menos um admin e atualize o painel.');
  return {ok:true,role:applied.role};
}

export async function administration(request,db,user,readBody) {
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,''),method=request.method;
  const supported=path==='/api/admin/dashboard'||path==='/api/admin/users'||path==='/api/admin/orders'||path==='/api/admin/audit'||/^\/api\/admin\/(users|orders)\//.test(path);
  if(!supported) return null;
  if(user.role!=='admin') fail(403,'A administração de contas é exclusiva do admin.');
  if(!await rolesReady(db)) fail(503,'O painel está preparado, mas falta aplicar a atualização 0003 do banco. Consulte o guia de administração.');
  await ensureShippingSchema(db);
  if(path==='/api/admin/dashboard'&&method==='GET') {
    const counts=(await db.prepare(`SELECT ${role} AS role,COUNT(*) AS total FROM users u LEFT JOIN account_roles ar ON ar.user_id=u.id GROUP BY ${role}`).all()).results;
    const orders=await db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(payment_status='pending'),0) AS pending,COALESCE(SUM(CASE WHEN payment_status='confirmed' THEN amount_cents ELSE 0 END),0) AS paid_cents FROM checkout_orders").first();
    const tables=[];
    // Curated database view. No arbitrary SQL, password hashes or session tokens.
    for(const [name,label] of [['users','Contas'],['customer_profiles','Dados cadastrais'],['checkout_orders','Encomendas'],['checkout_items','Itens dos pedidos'],['checkout_fulfillment','Retiradas e entregas'],['account_roles','Cargos atribuídos'],['role_changes','Alterações de cargos']]) {
      const result=await db.prepare(`SELECT COUNT(*) AS total FROM ${name}`).first();
      tables.push({name,label,total:result.total});
    }
    return {roles:Object.fromEntries(Object.keys(roleNames).map(name=>[name,counts.find(c=>c.role===name)?.total||0])),orders,tables};
  }
  if(path==='/api/admin/users'&&method==='GET') {
    const {page,limit,offset}=pagination(url.searchParams),q=(url.searchParams.get('q')||'').trim().slice(0,100),filter=url.searchParams.get('role')||'';
    if(filter&&!Object.hasOwn(roleNames,filter)) fail(400,'Filtro de cargo inválido.');
    const clauses=[],values=[];
    if(q) {clauses.push('(instr(lower(u.name),lower(?))>0 OR instr(lower(u.email),lower(?))>0)');values.push(q,q);}
    if(filter) {clauses.push(`${role}=?`);values.push(filter);}
    const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
    const total=(await db.prepare(`SELECT COUNT(*) AS total FROM users u LEFT JOIN account_roles ar ON ar.user_id=u.id${where}`).bind(...values).first()).total;
    const users=(await db.prepare(`${userSelect}${where} ORDER BY u.created_at DESC,u.rowid DESC LIMIT ? OFFSET ?`).bind(...values,limit,offset).all()).results;
    return {users,total,page,limit,pages:Math.max(1,Math.ceil(total/limit))};
  }
  const users=path.match(/^\/api\/admin\/users\/([a-f0-9-]+)(?:\/(orders|role))?$/);
  if(users) {
    const [,id,action]=users;
    if(action==='role'&&method==='POST') return changeRole(db,user,id,await readBody(request));
    if(!action&&method==='GET') return userDetail(db,id);
    if(action==='orders'&&method==='GET') {
      const detail=await userDetail(db,id),{page,limit,offset}=pagination(url.searchParams);
      const orders=(await db.prepare(`${orderSelect} WHERE c.user_id=? ORDER BY c.created_at DESC,c.rowid DESC LIMIT ? OFFSET ?`).bind(id,limit,offset).all()).results;
      return {user:detail.user,orders,total:detail.user.order_count,page,limit,pages:Math.max(1,Math.ceil(detail.user.order_count/limit))};
    }
  }
  if(path==='/api/admin/orders'&&method==='GET') {
    const {page,limit,offset}=pagination(url.searchParams),q=(url.searchParams.get('q')||'').trim().slice(0,100),status=url.searchParams.get('status')||'';
    if(status&&!['pending','confirmed','not_approved'].includes(status)) fail(400,'Filtro de pagamento inválido.');
    const clauses=[],values=[];
    if(q) {clauses.push('(instr(lower(c.number),lower(?))>0 OR instr(lower(c.customer_name),lower(?))>0)');values.push(q,q);}
    if(status) {clauses.push('c.payment_status=?');values.push(status);}
    const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
    const total=(await db.prepare(`SELECT COUNT(*) AS total FROM checkout_orders c${where}`).bind(...values).first()).total;
    const orders=(await db.prepare(`${orderSelect}${where} ORDER BY c.created_at DESC,c.rowid DESC LIMIT ? OFFSET ?`).bind(...values,limit,offset).all()).results;
    return {orders,total,page,limit,pages:Math.max(1,Math.ceil(total/limit))};
  }
  const order=path.match(/^\/api\/admin\/orders\/([a-f0-9-]+)$/);
  if(order&&method==='GET') {
    const checkout=await getCheckout(db,order[1]);
    if(!checkout) fail(404,'Encomenda não encontrada.');
    return {order:checkout};
  }
  if(path==='/api/admin/audit'&&method==='GET') {
    const {page,limit,offset}=pagination(url.searchParams);
    const total=(await db.prepare('SELECT COUNT(*) AS total FROM role_changes').first()).total;
    const events=(await db.prepare(`SELECT r.id,r.user_id,r.previous_role,r.new_role,r.created_at,u.name AS user_name,u.email AS user_email,a.name AS actor_name
      FROM role_changes r JOIN users u ON u.id=r.user_id JOIN users a ON a.id=r.changed_by ORDER BY r.created_at DESC,r.rowid DESC LIMIT ? OFFSET ?`).bind(limit,offset).all()).results;
    return {events,total,page,limit,pages:Math.max(1,Math.ceil(total/limit))};
  }
  fail(404,'Página não encontrada.');
}
