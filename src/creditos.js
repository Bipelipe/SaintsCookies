import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import './style.css';
import './creditos.css';
import { money } from './products.js';
import { api } from './api.js';
import { renderCommerce, renderAdminCheckouts, setupCommerce } from './account-commerce.js';

const $ = selector => document.querySelector(selector);
const arrow = '<svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const date = value => new Date(value * 1000).toLocaleDateString('pt-BR');
const status = value => ({ pending: 'Aguardando conferência', confirmed: 'Confirmada', rejected: 'Não aprovada', fulfilled: 'Entregue' })[value] || value;
let mode = 'login', account;
let purchaseKey, rewardKeys = {};
function feedback(message, error = false) {
  $('#feedback').textContent = message;
  $('#feedback').className = error ? 'feedback error' : 'feedback';
  $('#feedback').setAttribute('role', error ? 'alert' : 'status');
}
function showAuth() {
  account = undefined;
  $('#auth-panel').hidden = false;
  $('#account-panel').hidden = $('#admin-panel').hidden = $('#sign-out').hidden = true;
}
function renderAccount() {
  $('#auth-panel').hidden = true;
  $('#account-panel').hidden = $('#sign-out').hidden = false;
  $('#customer-name').textContent = account.user.name;
  $('#customer-email').textContent = account.user.email;
  $('#balance').textContent = account.balance;
  renderCommerce(account);
  const next = account.rewards.find(r => r.cost > account.balance && r.stock > 0);
  $('#next-reward').textContent = next ? `Faltam ${next.cost - account.balance} pontos para ${next.title.toLowerCase()}.` : 'Escolha um brinde disponível e combine a retirada com a equipe.';
  $('#rewards-list').innerHTML = account.rewards.map(r => `<article class="reward-card"><span class="reward-star" aria-hidden="true">✦</span><p class="eyebrow">${r.cost} PONTOS</p><h3>${escape(r.title)}</h3><p>${escape(r.description)}</p><p class="reward-stock">${r.stock > 0 ? `${r.stock} disponíveis neste teste` : 'Sem estoque no momento'}</p><button class="button button-primary" data-redeem="${escape(r.id)}" ${r.cost > account.balance || !r.stock ? 'disabled' : ''}>${r.stock ? r.cost > account.balance ? `Faltam ${r.cost - account.balance} pontos` : `Trocar meus pontos ${arrow}` : 'Esgotado'}</button></article>`).join('');
  $('#orders-list').innerHTML = account.orders.length ? account.orders.map(o => `<article class="history-row"><div><strong>${money(o.amount_cents / 100)}</strong><span>${escape(o.customer_note)}</span><small>${date(o.created_at)}</small></div><span class="status ${o.status}">${status(o.status)}${o.points ? ` · +${o.points} pontos` : ''}</span></article>`).join('') : '<p class="empty-history">Suas compras aparecerão aqui depois de enviadas para conferência.</p>';
  $('#entries-list').innerHTML = account.entries.length ? account.entries.map(e => `<article class="history-row"><div><strong>${escape(e.description)}</strong><small>${date(e.created_at)}</small></div><b class="points-change ${e.delta > 0 ? 'positive' : ''}">${e.delta > 0 ? '+' : ''}${e.delta}</b></article>`).join('') : '<p class="empty-history">Seus pontos começam a contar após a primeira compra confirmada.</p>';
  $('#redemptions-list').innerHTML = account.redemptions.length ? account.redemptions.map(r => `<article class="history-row"><div><strong>${escape(r.title)}</strong><span>Código ${escape(r.id.slice(0,8).toUpperCase())} · ${r.points} pontos</span><small>${date(r.created_at)}</small></div><span class="status ${r.status}">${r.status === 'pending' ? 'Aguardando entrega' : status(r.status)}</span></article>`).join('') : '<p class="empty-history">Seus próximos mimos vão aparecer aqui.</p>';
}
async function loadAdmin() {
  if (account?.user.role !== 'admin') { $('#admin-panel').hidden = true; return; }
  const data = await api('/admin/overview');
  $('#admin-panel').hidden = false;
  renderAdminCheckouts(data);
  const pending = data.orders.filter(o => o.status === 'pending');
  $('#admin-orders').innerHTML = pending.length ? pending.map(o => { const web = data.checkouts.find(c => c.loyalty_order_id === o.id); return `<article class="admin-item"><h3>${escape(o.name)}</h3><p>${escape(o.email)} · informado: ${money(o.amount_cents/100)}</p><p>${escape(o.customer_note)} · ${date(o.created_at)}</p><form data-confirm="${o.id}"><label>Valor confirmado (R$)<input name="amount" inputmode="decimal" value="${(o.amount_cents/100).toFixed(2).replace('.', ',')}" ${web ? 'readonly' : ''} required></label><label>Referência única da venda<input name="reference" value="${web ? `web-${web.id}` : ''}" ${web ? 'readonly' : ''} placeholder="Ex.: venda-2026-001" minlength="3" maxlength="100" required></label><div class="admin-actions"><button type="submit" class="button button-primary">Confirmar compra e liberar pontos</button><button type="button" class="button button-outline" data-reject="${o.id}">Não aprovar</button></div></form></article>`; }).join('') : '<p class="empty-history">Tudo conferido! Nenhuma compra pendente.</p>';
  const gifts = data.redemptions.filter(r => r.status === 'pending');
  $('#admin-redemptions').innerHTML = gifts.length ? gifts.map(r => `<article class="admin-item"><h3>${escape(r.title)}</h3><p>${escape(r.name)} · ${escape(r.email)}</p><p>Código ${escape(r.id.slice(0,8).toUpperCase())} · ${r.points} pontos já descontados</p><button class="button button-primary" data-fulfill="${r.id}">Marcar como entregue</button></article>`).join('') : '<p class="empty-history">Nenhum brinde aguardando entrega.</p>';
}
async function load() {
  try { account = await api('/account'); renderAccount(); await loadAdmin(); }
  catch (error) { if (error.status === 401) showAuth(); else throw error; }
}
function parseAmount(value) {
  if (!/^\d{1,5}([.,]\d{1,2})?$/.test(value.trim())) throw new Error('Informe o valor no formato 50,00.');
  const [integer, decimals = ''] = value.trim().replace(',', '.').split('.');
  return Number(integer) * 100 + Number(decimals.padEnd(2, '0'));
}
document.addEventListener('click', async event => {
  const auth = event.target.closest('[data-auth]');
  if (auth) {
    mode = auth.dataset.auth;
    document.querySelectorAll('[data-auth]').forEach(b => { b.classList.toggle('active', b === auth); b.setAttribute('aria-pressed', String(b === auth)); });
    $('#registration-fields').hidden = mode !== 'register';
    $('#registration-fields').disabled = mode !== 'register';
    $('#auth-form').elements.password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('#auth-submit').innerHTML = `${mode === 'register' ? 'Criar minha conta' : 'Entrar no clube'} ${arrow}`;
    feedback('');
    return;
  }
  const button = event.target.closest('[data-redeem], [data-reject], [data-fulfill], #sign-out, #refresh-admin, #refresh-account');
  if (!button || button.disabled) return;
  try {
    if (button.dataset.redeem) {
      const reward = account.rewards.find(r => r.id === button.dataset.redeem);
      if (!confirm(`Trocar ${reward.cost} pontos por ${reward.title}? Os pontos serão descontados agora.`)) return;
      button.disabled = true;
      rewardKeys[reward.id] ||= crypto.randomUUID();
      await api('/redemptions', { reward_id: reward.id, request_key: rewardKeys[reward.id] });
      delete rewardKeys[reward.id];
      await load(); feedback('Brinde reservado! Seus pontos foram descontados. Combine a entrega com a equipe.');
    } else if (button.dataset.reject) {
      if (!confirm('Não aprovar esta compra? Nenhum ponto será creditado.')) return;
      button.disabled = true; await api(`/admin/orders/${button.dataset.reject}/reject`, {}); await load(); feedback('Compra não aprovada.');
    } else if (button.dataset.fulfill) {
      button.disabled = true; await api(`/admin/redemptions/${button.dataset.fulfill}/fulfill`, {}); await load(); feedback('Entrega do brinde registrada.');
    } else if (button.id === 'sign-out') {
      button.disabled = true; await api('/auth/logout', {}); showAuth(); $('#auth-form').reset(); feedback('Você saiu da conta. Até a próxima!');
    } else { button.disabled = true; await load(); feedback('Informações atualizadas.'); }
  } catch (error) { feedback(error.message, true); if (error.status === 401) showAuth(); }
  finally { button.disabled = false; }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('#auth-form, #purchase-form, [data-confirm]')) return;
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  feedback('');
  try {
    const data = new FormData(form);
    if (form.id === 'auth-form') {
      await api(`/auth/${mode}`, Object.fromEntries(data));
      form.reset(); await load(); feedback('Bem-vindo ao Clube Saints’!');
    } else if (form.id === 'purchase-form') {
      purchaseKey ||= crypto.randomUUID();
      await api('/orders', { amount_cents: parseAmount(data.get('amount')), note: data.get('note'), request_key: purchaseKey });
      purchaseKey = undefined; form.reset(); await load(); feedback('Compra enviada! Os pontos serão liberados após a conferência da equipe.');
    } else {
      await api(`/admin/orders/${form.dataset.confirm}/confirm`, { amount_cents: parseAmount(data.get('amount')), sale_reference: data.get('reference') });
      await load(); feedback('Compra confirmada. Os pontos já estão disponíveis para o cliente.');
    }
  } catch (error) { feedback(error.message, true); if (error.status === 401) showAuth(); }
  finally { button.disabled = false; }
});
setupCommerce({ reload:load, feedback });
load().catch(error => { showAuth(); feedback(error.message, true); });
