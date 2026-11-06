import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import './style.css';
import './conta.css';
import './admin.css';
import { api } from './api.js';
import { money } from './products.js';

const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles={admin:'Admin',owner:'Dono',customer:'Cliente'};
const payments={pix:'Pix',credit_card:'Cartão de crédito',debit_card:'Cartão de débito',cash:'Dinheiro'};
const paymentStatus={pending:'Pagamento pendente',confirmed:'Pagamento confirmado',not_approved:'Pagamento não confirmado'};
const date=value=>value?new Date(value*1000).toLocaleString('pt-BR'):'—';
const badge=role=>`<span class="role-badge ${role}">${roles[role]}</span>`;
const params=new URLSearchParams(location.search);
const validId=value=>/^[a-f0-9-]{1,80}$/.test(value||'');
let actor,userId=validId(params.get('user'))?params.get('user'):null,orderId=validId(params.get('order'))?params.get('order'):null;
const pages={users:1,orders:1,audit:1,history:1};
function feedback(message,error=false) {
  $('#admin-feedback').textContent=message;$('#admin-feedback').className=error?'feedback error':'feedback';
  $('#admin-feedback').setAttribute('role',error?'alert':'status');
}
function denied(message) {
  $('#access-panel').hidden=false;$('#access-message').textContent=message;$('#admin-login').hidden=false;
  $('#administration-panel').hidden=true;$('#administration-panel').replaceChildren();
}
function handle(error) {
  if(error.status===401) denied('Entre na sua conta de admin para acessar o painel.');
  else if(error.status===403) denied('Este painel é exclusivo do admin. Acesse sua conta para consultar as funções disponíveis para seu cargo.');
  else feedback(error.message,true);
}
function pagination(target,data) {
  const {page,pages,total}=data;
  $(`#${target==='history'?'history':target}-pagination`).innerHTML=`<span>${total} registro${total===1?'':'s'} · página ${page} de ${pages}</span><button class="button button-outline" data-page-target="${target}" data-page="${page-1}" ${page<=1?'disabled':''}>Anterior</button><button class="button button-outline" data-page-target="${target}" data-page="${page+1}" ${page>=pages?'disabled':''}>Próxima</button>`;
}
function filters(formId,page) {
  const values=new URLSearchParams(new FormData($(formId)));values.set('page',String(page));return values;
}
function orderCards(orders) {
  return orders.length?orders.map(o=>`<article class="admin-order"><div class="admin-order-heading"><a href="./admin.html?order=${o.id}" data-open-order="${o.id}"><strong>Pedido ${escape(o.number)}</strong></a><strong>${money(o.amount_cents/100)}</strong></div><p>${escape(o.customer_name)} · ${escape(paymentStatus[o.payment_status])}</p><small>${date(o.created_at)}</small><p><a href="./admin.html?user=${o.user_id}" data-open-user="${o.user_id}">Ver conta e histórico do cliente</a></p></article>`).join(''):'<p class="empty-history">Nenhuma encomenda encontrada.</p>';
}
async function summary() {
  const data=await api('/admin/dashboard');
  const total=Object.values(data.roles).reduce((sum,n)=>sum+n,0);
  $('#dashboard-stats').innerHTML=[
    [total,'Contas cadastradas'],[data.orders.total,'Encomendas no site'],[data.orders.pending,'Pagamentos pendentes'],[money(data.orders.paid_cents/100),'Pagamentos confirmados'],
  ].map(([value,label])=>`<article class="stat-card"><strong>${escape(value)}</strong><span>${label}</span></article>`).join('');
  $('#database-tables').innerHTML=data.tables.map(t=>`<article class="database-card"><span>${escape(t.label)}</span><strong>${t.total}</strong><code>${escape(t.name)}</code><a class="text-link" href="${['users','customer_profiles','account_roles'].includes(t.name)?'#users-section':t.name==='role_changes'?'#audit-section':'#orders-section'}">Consultar registros</a></article>`).join('');
}
async function users(page=pages.users) {
  const data=await api(`/admin/users?${filters('#users-filter',page)}`);pages.users=data.page;
  $('#users-table').innerHTML=data.users.length?data.users.map(u=>`<tr><td><strong>${escape(u.name)}</strong><small>${escape(u.email)}</small>${u.phone?`<small>+${escape(u.phone)}</small>`:''}</td><td>${badge(u.role)}</td><td>${date(u.created_at)}</td><td>${u.order_count}</td><td>${money(u.paid_cents/100)}</td><td><a href="./admin.html?user=${u.id}" data-open-user="${u.id}">Dados e histórico</a></td></tr>`).join(''):'<tr><td colspan="6">Nenhuma conta encontrada.</td></tr>';
  pagination('users',data);
}
async function orders(page=pages.orders) {
  const data=await api(`/admin/orders?${filters('#orders-filter',page)}`);pages.orders=data.page;
  $('#all-orders').innerHTML=orderCards(data.orders);pagination('orders',data);
}
async function audit(page=pages.audit) {
  const data=await api(`/admin/audit?page=${page}`);pages.audit=data.page;
  $('#role-audit').innerHTML=data.events.length?data.events.map(e=>`<article class="audit-row"><strong>${escape(e.user_name)}</strong> · ${escape(e.user_email)}<p>${badge(e.previous_role)} → ${badge(e.new_role)}</p><small>Alterado por ${escape(e.actor_name)} · ${date(e.created_at)}</small></article>`).join(''):'<p class="empty-history">Nenhuma alteração de cargo realizada pelo painel.</p>';
  pagination('audit',data);
}
function updateUrl() {
  const query=new URLSearchParams();if(userId)query.set('user',userId);if(orderId)query.set('order',orderId);
  history.replaceState({},'',`${location.pathname}${query.size?'?'+query:''}`);
}
async function userDetail(id,page=1) {
  const [detail,history]=await Promise.all([api(`/admin/users/${id}`),api(`/admin/users/${id}/orders?page=${page}`)]);
  userId=id;pages.history=history.page;updateUrl();
  const {user,profile}=detail;
  $('#user-detail').hidden=false;
  $('#user-detail').innerHTML=`<div class="admin-heading-actions"><h2>${escape(user.name)}</h2>${badge(user.role)}</div><dl class="detail-grid"><div><dt>E-mail de acesso</dt><dd>${escape(user.email)}</dd></div><div><dt>Telefone</dt><dd>${profile?'+':' '}${escape(profile?.phone||'Não informado')}</dd></div><div><dt>Endereço cadastrado</dt><dd>${escape(profile?.address||'Não informado')}</dd></div><div><dt>Pagamento preferido</dt><dd>${payments[profile?.payment_preference]||'Não informado'}</dd></div><div><dt>Data do cadastro</dt><dd>${date(user.created_at)}</dd></div><div><dt>Encomendas e pagamentos</dt><dd>${user.order_count} pedidos · ${money(user.paid_cents/100)} confirmados</dd></div></dl>
    <form class="role-form" id="role-form" data-user-id="${id}" data-expected-role="${user.role}"><label>Cargo desta conta<select aria-label="Cargo desta conta" name="role" ${id===actor.id?'disabled':''}>${Object.entries(roles).map(([value,label])=>`<option value="${value}" ${value===user.role?'selected':''}>${label}</option>`).join('')}</select></label><button class="button button-primary" type="submit" ${id===actor.id?'disabled':''}>Salvar cargo</button></form>
    ${id===actor.id?'<p class="field-help">Seu próprio acesso de admin é preservado neste painel.</p>':''}
    <h3>Histórico de encomendas</h3><div id="user-order-history">${orderCards(history.orders)}</div><div id="history-pagination" class="admin-pagination"></div>`;
  pagination('history',history);
}
async function orderDetail(id) {
  const {order:o}=await api(`/admin/orders/${id}`);orderId=id;updateUrl();
  $('#order-detail').hidden=false;
  $('#order-detail').innerHTML=`<h2>Pedido <em>${escape(o.number)}</em></h2><dl class="detail-grid"><div><dt>Cliente na encomenda</dt><dd>${escape(o.customer_name)}</dd></div><div><dt>Total dos cookies</dt><dd>${money(o.amount_cents/100)}</dd></div><div><dt>Situação</dt><dd>${paymentStatus[o.payment_status]}</dd></div><div><dt>Recebido em</dt><dd>${date(o.created_at)}</dd></div><div><dt>Telefone informado no pedido</dt><dd>+${escape(o.phone)}</dd></div><div><dt>Endereço informado no pedido</dt><dd>${escape(o.address)}</dd></div><div><dt>Pagamento preferido</dt><dd>${payments[o.payment_preference]}</dd></div><div><dt>Atendimento</dt><dd>Retirada com a Saints’</dd></div></dl><div class="admin-order"><ul>${o.items.map(i=>`<li>${i.quantity}× ${escape(i.product_name)} · ${money(i.unit_cents*i.quantity/100)}</li>`).join('')}</ul></div><a href="./admin.html?user=${o.user_id}" data-open-user="${o.user_id}">Consultar conta e histórico deste cliente</a>${o.payment_status==='pending'?`<p><button class="button button-primary" data-admin-payment="${o.id}">Confirmar pagamento deste pedido</button></p>`:''}`;
}
async function refresh() {
  await Promise.all([summary(),users(),orders(),audit()]);
  if(userId) await userDetail(userId,pages.history);
  if(orderId) await orderDetail(orderId);
}
document.addEventListener('submit',async event=>{
  const form=event.target;if(!form.matches('#users-filter,#orders-filter,#role-form'))return;
  event.preventDefault();const button=form.querySelector('[type="submit"]');if(button.disabled)return;
  try {
    if(form.id==='role-form') {
      const next=new FormData(form).get('role');
      if(next!==form.dataset.expectedRole&&!confirm(`Alterar esta conta de ${roles[form.dataset.expectedRole]} para ${roles[next]}?`))return;
      button.disabled=true;
      await api(`/admin/users/${form.dataset.userId}/role`,{role:next,expected_role:form.dataset.expectedRole});
      await refresh();feedback('Cargo atualizado. As permissões já valem nas próximas solicitações.');
    } else {button.disabled=true;await (form.id==='users-filter'?users(1):orders(1));}
  } catch(error){handle(error);}finally{button.disabled=false;}
});
document.addEventListener('click',async event=>{
  const control=event.target.closest('[data-page-target],[data-open-user],[data-open-order],[data-admin-payment],#refresh-dashboard,#admin-logout');
  if(!control||control.disabled)return;event.preventDefault();
  try {
    if(control.dataset.openUser){await userDetail(control.dataset.openUser);$('#user-detail').scrollIntoView({behavior:'smooth'});}
    else if(control.dataset.openOrder){await orderDetail(control.dataset.openOrder);$('#order-detail').scrollIntoView({behavior:'smooth'});}
    else if(control.dataset.pageTarget){control.disabled=true;const loaders={users,orders,audit,history:page=>userDetail(userId,page)};await loaders[control.dataset.pageTarget](Number(control.dataset.page));}
    else if(control.dataset.adminPayment){if(!confirm('Você conferiu o recebimento deste pagamento?'))return;control.disabled=true;await api(`/admin/checkouts/${control.dataset.adminPayment}/confirm-payment`,{});await refresh();feedback('Pagamento confirmado.');}
    else if(control.id==='admin-logout'){control.disabled=true;await api('/auth/logout',{});location.href='./conta.html';}
    else{control.disabled=true;await refresh();feedback('Painel atualizado.');}
  }catch(error){handle(error);}finally{control.disabled=false;}
});
async function start() {
  const account=await api('/account');actor=account.user;
  if(actor.role!=='admin'){denied('Este painel é exclusivo do admin. Seu cargo permite usar as funções disponíveis em Minha conta.');return;}
  await refresh();
  $('#access-panel').hidden=true;$('#administration-panel').hidden=false;$('#admin-logout').hidden=false;
  $('#admin-identity').textContent=`${actor.name} · ${actor.email} · Admin`;
}
start().catch(error=>{
  if(![401,403].includes(error.status)){$('#access-message').textContent=error.message;$('#admin-login').hidden=false;}
  handle(error);
});
