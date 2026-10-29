import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import './style.css';
import './creditos.css';
import { products, money, total, orderText } from './products.js';

let bag = {};
try {
  const saved = JSON.parse(localStorage.getItem('saints-bag') || '{}');
  for (const p of products) if (Number.isInteger(saved?.[p.id]) && saved[p.id] > 0) bag[p.id] = Math.min(99, saved[p.id]);
} catch {}
let filter = 'all';
let toastTimer;
const $ = selector => document.querySelector(selector);
const imageRoot = `${import.meta.env.BASE_URL}images/`;
const drawer = $('#bag-drawer');
let previousFocus;

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3000);
}
function save() {
  try { localStorage.setItem('saints-bag', JSON.stringify(bag)); } catch {}
  $('.bag-count').textContent = Object.values(bag).reduce((a, b) => a + b, 0);
  renderBag();
}
function renderProducts() {
  $('#product-grid').innerHTML = products.filter(p => filter === 'all' || p.category === filter).map(p => `<article class="product-card"><div class="product-image ${p.style}"><img src="${imageRoot}flavors.webp" alt="Foto ilustrativa de cookie artesanal — ${p.name}" loading="lazy">${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}<button class="quick-add" data-add="${p.id}" aria-label="Adicionar ${p.name} à sacola">+</button></div><div class="product-info"><div class="product-title"><h3>${p.name}</h3><span>${money(p.price)}</span></div><p>${p.description}</p><span class="product-detail">ARTESANAL · APROX. 100 G</span></div></article>`).join('');
}
function renderBag() {
  const selected = products.filter(p => bag[p.id]);
  $('#bag-items').innerHTML = selected.length ? selected.map(p => `<article class="bag-item"><img src="${imageRoot}cookies.webp" alt=""><div><h3>${p.name}</h3><p>${money(p.price)}</p><div class="quantity"><button data-quantity="${p.id}" data-change="-1" aria-label="Remover uma unidade de ${p.name}">−</button><span>${bag[p.id]}</span><button data-quantity="${p.id}" data-change="1" aria-label="Adicionar uma unidade de ${p.name}" ${bag[p.id] >= 99 ? 'disabled' : ''}>+</button></div></div><strong>${money(p.price * bag[p.id])}</strong></article>`).join('') : '<div class="empty-bag"><span>♡</span><h3>Um espaço para coisas gostosas.</h3><p>Seus cookies favoritos estão esperando por você.</p><button class="button button-primary" id="browse-cookies">Explorar os sabores <svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg></button></div>';
  $('#bag-summary').innerHTML = selected.length ? `<div class="subtotal"><span>Total dos cookies</span><strong>${money(total(bag))}</strong></div><p class="checkout-note">Feche sua encomenda com sua conta Saints’. Nesta prévia, os pedidos são de teste, com retirada e pagamento a combinar.</p><a class="button button-primary checkout-button" id="checkout-link" href="./creditos.html?checkout=1">Fechar pedido</a><button class="button button-outline checkout-button" id="copy-order">Copiar minha seleção <span><svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg></span></button><a class="instagram-checkout" href="https://www.instagram.com/saintscookies/" target="_blank" rel="noopener noreferrer">Enviar pelo Instagram <svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg></a><p class="checkout-note">Copie a seleção e cole em uma mensagem no Instagram.</p><textarea class="order-fallback" id="order-fallback" aria-label="Seleção para copiar manualmente" readonly hidden></textarea>` : '';
}
function setDrawer(open) {
  if (open) previousFocus = document.activeElement;
  drawer.hidden = !open;
  $('#drawer-overlay').hidden = !open;
  document.body.classList.toggle('drawer-open', open);
  document.querySelectorAll('header, main, footer').forEach(element => { element.inert = open; });
  if (open) $('#close-bag').focus();
  else previousFocus?.focus();
}
document.addEventListener('click', async event => {
  const add = event.target.closest('[data-add]');
  if (add) {
    const p = products.find(p => p.id === add.dataset.add);
    if ((bag[p.id] || 0) >= 99) return notify('Você já selecionou 99 unidades deste sabor.');
    bag[p.id] = (bag[p.id] || 0) + 1;
    save(); notify(`${p.name} adicionado à sacola ♡`);
  }
  const button = event.target.closest('[data-filter]');
  if (button && button.dataset.filter !== filter) {
    const toolbar = $('.catalog-toolbar');
    const headerHeight = $('.header').getBoundingClientRect().height;
    const wasPinned = toolbar.getBoundingClientRect().top <= headerHeight + 1;
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
    renderProducts();
    if (wasPinned) {
      // A shorter category must not leave the visitor past its first cookies.
      const gridTop = $('#product-grid').getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: gridTop - headerHeight - toolbar.getBoundingClientRect().height - 12,
        behavior: 'instant',
      });
    }
  }
  const quantity = event.target.closest('[data-quantity]');
  if (quantity) {
    const id = quantity.dataset.quantity;
    bag[id] = Math.max(0, Math.min(99, (bag[id] || 0) + Number(quantity.dataset.change)));
    if (!bag[id]) delete bag[id];
    save();
    const next = document.querySelector(`[data-quantity="${id}"][data-change="${quantity.dataset.change}"]`);
    (next || $('#close-bag')).focus();
  }
  if (event.target.closest('#browse-cookies')) { setDrawer(false); $('#sabores').scrollIntoView({ behavior: 'smooth' }); }
  if (event.target.closest('#copy-order')) {
    const text = orderText(bag);
    try { await navigator.clipboard.writeText(text); notify('Seleção copiada! Cole na conversa com a Saints’.'); }
    catch { const field = $('#order-fallback'); field.hidden = false; field.value = text; field.focus(); field.select(); notify('Selecione e copie o texto abaixo.'); }
  }
});
$('#open-bag').addEventListener('click', () => setDrawer(true));
$('#close-bag').addEventListener('click', () => setDrawer(false));
$('#drawer-overlay').addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', event => {
  if (drawer.hidden) return;
  if (event.key === 'Escape') setDrawer(false);
  if (event.key === 'Tab') {
    const elements = [...drawer.querySelectorAll('button:not([disabled]), a[href], textarea:not([hidden])')];
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
$('#year').textContent = new Date().getFullYear();
renderProducts(); save();
