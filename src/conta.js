import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import './style.css';
import './conta.css';
import './admin.css';
import { api } from './api.js';
import { renderCommerce, renderAdminCheckouts, setupCommerce } from './account-commerce.js';

const $ = selector => document.querySelector(selector);
const arrow = '<svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
let mode = 'login', account;
function feedback(message, error = false) {
  $('#feedback').textContent = message;
  $('#feedback').className = error ? 'feedback error' : 'feedback';
  $('#feedback').setAttribute('role', error ? 'alert' : 'status');
}
function showAuth() {
  account = undefined;
  $('#auth-panel').hidden = false;
  $('#account-panel').hidden = $('#admin-panel').hidden = $('#sign-out').hidden = $('#admin-navigation').hidden = true;
}
function renderAccount() {
  $('#auth-panel').hidden = true;
  $('#account-panel').hidden = $('#sign-out').hidden = false;
  $('#customer-name').textContent = account.user.name;
  $('#customer-email').textContent = account.user.email;
  const roleNames={admin:'Admin',owner:'Dono',customer:'Cliente'};
  $('#customer-role').textContent = roleNames[account.user.role];
  $('#customer-role').className = `account-role role-badge ${account.user.role}`;
  $('#admin-navigation').hidden=account.user.role!=='admin';
  renderCommerce(account);
}
async function loadAdmin() {
  if (!['admin','owner'].includes(account?.user.role)) { $('#admin-panel').hidden = true; return; }
  const data = await api('/admin/overview');
  $('#admin-panel').hidden = false;
  renderAdminCheckouts(data);
}
async function load() {
  try { account = await api('/account'); renderAccount(); await loadAdmin(); }
  catch (error) { if (error.status === 401) showAuth(); else throw error; }
}
document.addEventListener('click', async event => {
  const auth = event.target.closest('[data-auth]');
  if (auth) {
    mode = auth.dataset.auth;
    document.querySelectorAll('[data-auth]').forEach(b => { b.classList.toggle('active', b === auth); b.setAttribute('aria-pressed', String(b === auth)); });
    $('#registration-fields').hidden = mode !== 'register';
    $('#registration-fields').disabled = mode !== 'register';
    $('#auth-form').elements.password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('#auth-submit').innerHTML = `${mode === 'register' ? 'Criar minha conta' : 'Entrar na minha conta'} ${arrow}`;
    feedback('');
    return;
  }
  const button = event.target.closest('#sign-out, #refresh-admin, #refresh-account');
  if (!button || button.disabled) return;
  try {
    button.disabled = true;
    if (button.id === 'sign-out') {
      await api('/auth/logout', {}); showAuth(); $('#auth-form').reset(); feedback('Você saiu da conta. Até a próxima!');
    } else { await load(); feedback('Informações atualizadas.'); }
  } catch (error) { feedback(error.message, true); if (error.status === 401) showAuth(); }
  finally { button.disabled = false; }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (form.id !== 'auth-form') return;
  event.preventDefault();
  const button = $('#auth-submit');
  if (button.disabled) return;
  button.disabled = true; feedback('');
  try {
    await api(`/auth/${mode}`, Object.fromEntries(new FormData(form)));
    form.reset(); await load();
    if(new URLSearchParams(location.search).get('next')==='admin'&&account?.user.role==='admin'){location.href='./admin.html';return;}
    feedback('Bem-vindo à Saints’!');
  } catch (error) { feedback(error.message, true); if (error.status === 401) showAuth(); }
  finally { button.disabled = false; }
});
setupCommerce({ reload:load, feedback });
load().catch(error => { showAuth(); feedback(error.message, true); });
