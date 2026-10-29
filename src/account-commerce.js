import { products, money } from './products.js';
import { api } from './api.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const payments = { pix:'Pix',credit_card:'Cartão de crédito',debit_card:'Cartão de débito',cash:'Dinheiro' };
const paymentStatus = {pending:'Pagamento pendente',confirmed:'Pagamento conferido pela equipe',not_approved:'Pagamento não confirmado pela equipe'};
const delivery = {
  pending:'Aguardando envio',not_configured:'WhatsApp ainda não ativado',opted_out:'Sem autorização para WhatsApp',
  sending:'Envio em andamento',submitted:'Mensagem aceita pelo WhatsApp',delivered:'Comprovante entregue no WhatsApp',
  read:'Comprovante lido no WhatsApp',failed:'Falha no envio; a equipe pode tentar novamente',uncertain:'Envio em verificação pela equipe',
};
let current, reload, feedback, submitting = false, receipt;
const intentStorageKey = () => `saints-checkout-intent-${current.user.id}`;
function savedIntent() {
  try { return JSON.parse(sessionStorage.getItem(intentStorageKey())); } catch { return null; }
}
function cart() {
  let stored; try { stored = JSON.parse(localStorage.getItem('saints-bag') || '{}'); } catch { stored = {}; }
  return products.filter(p=>Number.isInteger(stored?.[p.id]) && stored[p.id]>0 && stored[p.id]<=99).map(p=>({id:p.id,quantity:stored[p.id]}));
}
function intent(items, consent) {
  const itemsKey = JSON.stringify(items), key = intentStorageKey();
  let saved = savedIntent();
  if (!saved || saved.itemsKey !== itemsKey) {
    saved = {itemsKey,consent,request_key:crypto.randomUUID()};
    // If storage is unavailable, do not risk a second order after a lost response.
    sessionStorage.setItem(key,JSON.stringify(saved));
  }
  if(saved.consent !== consent) throw new Error('Já existe uma tentativa para esta sacola. Atualize a página para conferir o resultado antes de alterar o contato pelo WhatsApp.');
  return {key,...saved};
}
function receiptText(order) {
  return `Saints’ Cookies — pedido ${order.number}\nEncomenda aceita. ${paymentStatus[order.payment_status]}.\n\n${order.items.map(i=>`${i.quantity}x ${i.product_name} — ${money(i.quantity*i.unit_cents/100)}`).join('\n')}\n\nTotal: ${money(order.amount_cents/100)}\nCliente: ${order.customer_name}\nTelefone: +${order.phone}\nEndereço cadastrado: ${order.address}\nPagamento preferido: ${payments[order.payment_preference]}\nRetirada com a Saints’; horário a combinar.\nPontos liberados após a conferência do pagamento pela equipe.`;
}
function orderCard(order, admin = false) {
  const retry = admin && ['pending','not_configured','failed','uncertain','sending'].includes(order.whatsapp_status);
  return `<article class="web-order ${admin ? 'admin-item' : ''}"><div class="web-order-heading"><strong>Pedido ${escape(order.number)}</strong><span class="status confirmed">Encomenda aceita</span></div>
    <p>${escape(order.customer_name)} · ${money(order.amount_cents/100)}</p>
    <ul>${order.items.map(i=>`<li>${i.quantity}× ${escape(i.product_name)} · ${money(i.quantity*i.unit_cents/100)}</li>`).join('')}</ul>
    <p>${paymentStatus[order.payment_status]} · preferência: ${payments[order.payment_preference]}</p>
    <p>Retirada com a Saints’ · horário a combinar</p>
    ${admin ? `<p>Telefone: +${escape(order.phone)}<br>Endereço cadastrado: ${escape(order.address)}</p>` : ''}
    <p class="receipt-status">${delivery[order.whatsapp_status] || 'Envio em verificação'}</p>
    ${admin && order.whatsapp_error ? `<p class="field-help">Código de envio: ${escape(order.whatsapp_error)}</p>` : ''}
    ${retry ? `<button type="button" class="button button-outline" data-retry-receipt="${order.id}" data-delivery-status="${order.whatsapp_status}">Tentar envio do comprovante</button>` : ''}
    ${!admin ? `<button type="button" class="text-link" data-copy-receipt="${order.id}">Copiar comprovante</button>` : ''}
  </article>`;
}
export function renderCommerce(account) {
  if (receipt && receipt.user_id !== account.user.id) receipt = undefined;
  current = account;
  if(receipt) receipt = account.checkouts.find(o=>o.id===receipt.id) || receipt;
  const pending = savedIntent();
  const recovered = pending && account.checkouts.find(o=>o.request_key===pending.request_key);
  if(recovered) {
    const itemsKey = JSON.stringify(cart());
    if(itemsKey === pending.itemsKey || !cart().length) {
      receipt = recovered;
      try { localStorage.removeItem('saints-bag'); } catch {}
    }
    try { sessionStorage.removeItem(intentStorageKey()); } catch {}
  }
  const form = $('#profile-form');
  form.elements.name.value = account.user.name;
  for (const key of ['phone','address','payment_preference']) form.elements[key].value = account.profile?.[key] || '';
  $('#profile-help').textContent = account.profile ? 'Confira seus dados antes de fechar uma encomenda. Alterações valem para os próximos pedidos.' : 'Complete seus dados para conseguir fechar sua encomenda. Seu login e seus pontos continuam os mesmos.';
  if (!account.profile) $('#profile-details').open = true;
  $('#checkout-history').innerHTML = account.checkouts.length ? account.checkouts.map(order=>orderCard(order)).join('') : '<p class="empty-history">As encomendas aceitas no site aparecerão aqui.</p>';
  renderCheckout();
}
function renderCheckout() {
  const items = cart();
  if (receipt) {
    $('#checkout-content').innerHTML = `<div role="status"><h3>Pedido aceito! Agora é com a Saints’.</h3><p>Seu pedido está salvo. O pagamento e a liberação dos pontos serão conferidos pela equipe.</p></div>${orderCard(receipt)}<a class="button button-outline" href="./index.html#sabores">Voltar aos cookies</a>`;
    return;
  }
  if (!items.length) {
    $('#checkout-content').innerHTML = '<p>Escolha seus cookies favoritos na loja para preparar uma encomenda.</p><a class="button button-outline" href="./index.html#sabores">Escolher cookies</a>';
    return;
  }
  const total = items.reduce((sum,i)=>sum+products.find(p=>p.id===i.id).price*i.quantity,0);
  const pending = savedIntent();
  const consentChecked = pending?.itemsKey === JSON.stringify(items) && pending.consent === true;
  $('#checkout-content').innerHTML = `<ul class="checkout-items">${items.map(i=>{const p=products.find(p=>p.id===i.id);return `<li><span>${i.quantity}× ${p.name}</span><strong>${money(p.price*i.quantity)}</strong></li>`;}).join('')}</ul>
    <p class="checkout-total">Total dos cookies <strong>${money(total)}</strong></p>
    <p>Retirada com a Saints’, com horário a combinar. Pagamento preferido: <strong>${current.profile ? payments[current.profile.payment_preference] : 'complete seus dados acima'}</strong>.</p>
    <p>Ao confirmar, sua encomenda será aceita imediatamente. Este ambiente é de testes; não há cobrança automática. Os pontos entram após a conferência do pagamento.</p>
    <form id="checkout-form"><label class="check-label"><input name="whatsapp_consent" type="checkbox" ${consentChecked ? 'checked' : ''}><span>Autorizo a Saints’ Cookies a enviar a confirmação e atualizações deste pedido ao meu WhatsApp.</span></label>
    <p class="field-help">Se o envio estiver indisponível, seu pedido continuará salvo e o comprovante ficará disponível aqui. Você também pode encomendar sem receber mensagens.</p>
    <button type="submit" class="button button-primary" ${current.profile ? '' : 'disabled'}>Confirmar e aceitar encomenda</button></form>
    <p class="field-help">Confira a sacola antes de confirmar. <a href="./index.html#sabores">Alterar meus cookies</a></p>`;
}
export function renderAdminCheckouts(data) {
  $('#whatsapp-config-status').textContent = data.whatsapp_enabled ? 'Integração do WhatsApp ativada. Consulte abaixo o resultado de cada envio.' : 'O envio automático ainda depende das credenciais e do modelo aprovado no WhatsApp Business. Os pedidos continuam sendo aceitos e salvos.';
  $('#admin-checkouts').innerHTML = data.checkouts.length ? data.checkouts.map(order=>orderCard(order,true)).join('') : '<p class="empty-history">Nenhuma encomenda feita no site ainda.</p>';
}
export function setupCommerce(actions) {
  ({reload,feedback} = actions);
  document.addEventListener('submit',async event=>{
    const form = event.target;
    if (!form.matches('#profile-form,#checkout-form')) return;
    event.preventDefault();
    if (submitting) return;
    const button = form.querySelector('[type="submit"]');
    submitting = true; button.disabled = true; feedback('');
    try {
      if (form.id === 'profile-form') {
        await api('/profile',Object.fromEntries(new FormData(form)));
        await reload(); $('#profile-details').open = false; feedback('Seus dados foram salvos.');
      } else {
        const items = cart();
        if (!items.length) throw new Error('Sua sacola está vazia. Escolha seus cookies na loja.');
        const consent = form.elements.whatsapp_consent.checked;
        const pending = intent(items,consent);
        button.textContent = 'Registrando sua encomenda…';
        const result = await api('/checkout',{items,whatsapp_consent:consent,request_key:pending.request_key});
        receipt = result.order;
        // Preserve another tab's cart if it was changed while checkout was running.
        if (JSON.stringify(cart()) === JSON.stringify(items)) { try { localStorage.removeItem('saints-bag'); } catch {} }
        try { sessionStorage.removeItem(pending.key); } catch {}
        renderCheckout();
        await reload(); feedback('Encomenda aceita! Seu comprovante está disponível abaixo.');
        $('#checkout-section').scrollIntoView({behavior:'smooth',block:'start'});
      }
    } catch(error) { feedback(error.message,true); }
    finally { submitting = false; if(button.isConnected) { button.disabled = false; if(form.id==='checkout-form') button.textContent='Confirmar e aceitar encomenda'; } }
  });
  document.addEventListener('click',async event=>{
    const button = event.target.closest('[data-copy-receipt],[data-retry-receipt]');
    if(!button || button.disabled) return;
    try {
      if(button.dataset.copyReceipt) {
        const order = current.checkouts.find(o=>o.id===button.dataset.copyReceipt) || receipt;
        const value = receiptText(order);
        try { await navigator.clipboard.writeText(value); feedback('Comprovante copiado.'); }
        catch {
          let field = $('#receipt-copy-fallback');
          if(!field) { field = document.createElement('textarea');field.id='receipt-copy-fallback';field.setAttribute('aria-label','Comprovante para copiar');$('#checkout-content').append(field); }
          field.value=value;field.focus();field.select();feedback('Selecione e copie o comprovante abaixo.');
        }
      } else {
        const uncertain = ['uncertain','sending'].includes(button.dataset.deliveryStatus);
        if(uncertain && !confirm('Confira a conversa da empresa primeiro: este envio pode já ter chegado. Reenviar pode duplicar o comprovante. Deseja continuar?')) return;
        button.disabled=true;
        await api(`/admin/checkouts/${button.dataset.retryReceipt}/retry`,{acknowledge_duplicate_risk:uncertain});
        await reload();feedback('Tentativa registrada. Confira o status do comprovante no painel.');
      }
    } catch(error) { feedback(error.message,true); }
    finally { button.disabled=false; }
  });
}
