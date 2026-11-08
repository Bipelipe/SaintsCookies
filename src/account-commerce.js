import { products, money, productUnit } from './products.js';
import { api } from './api.js';
import { formatBrazilPhone } from './phone.js';
import { mountFulfillment, fulfillmentRequest, fulfillmentReady, shippingSummary, clearAddressConfirmation, fulfillmentChoice } from './fulfillment.js';
import { fulfillmentLabel } from './shipping.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const payments = { pix:'Pix',credit_card:'Cartão de crédito',debit_card:'Cartão de débito',cash:'Dinheiro' };
const hasPayment = profile => ['pix','cash'].includes(profile?.payment_preference);
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
function intent(items, consent, fulfillment) {
  const itemsKey = JSON.stringify(items), key = intentStorageKey();
  let saved = savedIntent();
  if (!saved) {
    saved = {itemsKey,consent,fulfillment,request_key:crypto.randomUUID()};
    // If storage is unavailable, do not risk a second order after a lost response.
    sessionStorage.setItem(key,JSON.stringify(saved));
  }
  if(saved.itemsKey!==itemsKey || saved.consent !== consent || JSON.stringify(saved.fulfillment||{method:'pickup'})!==JSON.stringify(fulfillment)) throw new Error('Já existe uma tentativa para esta sacola. Atualize a página para conferir o resultado antes de alterar os dados do pedido.');
  return {key,...saved};
}
function receiptText(order) {
  return `Saints’ Cookies — pedido ${order.number}\nEncomenda aceita. ${paymentStatus[order.payment_status]}.\n\n${order.items.map(i=>`${i.quantity}x ${i.product_name} — ${money(i.quantity*i.unit_cents/100)}`).join('\n')}\n\nProdutos: ${money((order.products_cents??order.amount_cents)/100)}${order.fulfillment==='delivery'?`\nFrete · ${order.region_name}: ${money(order.shipping_cents/100)} (valor de teste)`:''}\nTotal: ${money(order.amount_cents/100)}\nCliente: ${order.customer_name}\nTelefone: +${order.phone}\n${fulfillmentLabel(order)}${order.fulfillment==='delivery'?`\nEndereço de entrega confirmado: ${order.delivery_address}`:''}\nPagamento preferido: ${payments[order.payment_preference]}`;
}
function orderCard(order, admin = false) {
  const confirmPayment = admin && order.payment_status === 'pending';
  const retry = admin && ['pending','not_configured','failed','uncertain','sending'].includes(order.whatsapp_status);
  return `<article class="web-order ${admin ? 'admin-item' : ''}"><div class="web-order-heading"><strong>Pedido ${escape(order.number)}</strong><span class="status confirmed">Encomenda aceita</span></div>
    <p>${escape(order.customer_name)} · ${money(order.amount_cents/100)}</p>
    <ul>${order.items.map(i=>`<li>${i.quantity}× ${escape(i.product_name)} · ${money(i.quantity*i.unit_cents/100)}</li>`).join('')}</ul>
    <p>${paymentStatus[order.payment_status]} · preferência: ${payments[order.payment_preference]}</p>
    <p>${escape(fulfillmentLabel(order))}</p>
    ${order.fulfillment==='delivery'?`<p>Endereço de entrega confirmado: ${escape(order.delivery_address)}</p><p>Produtos: ${money(order.products_cents/100)} · Frete: ${money(order.shipping_cents/100)} · Total: ${money(order.amount_cents/100)}</p><p class="shipping-test-note">Frete fictício para testes.</p>`:''}
    ${admin ? `<p>Telefone: +${escape(order.phone)}<br>Endereço cadastrado: ${escape(order.address)}</p>` : ''}
    <p class="receipt-status">${delivery[order.whatsapp_status] || 'Envio em verificação'}</p>
    ${admin && order.whatsapp_error ? `<p class="field-help">Código de envio: ${escape(order.whatsapp_error)}</p>` : ''}
    ${confirmPayment ? `<button type="button" class="button button-primary" data-confirm-payment="${order.id}">Confirmar pagamento</button>` : ''}
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
      receipt = recovered;clearAddressConfirmation();
      try { localStorage.removeItem('saints-bag'); } catch {}
    }
    try { sessionStorage.removeItem(intentStorageKey()); } catch {}
  }
  const form = $('#profile-form');
  form.elements.name.value = account.user.name;
  for (const key of ['phone','address','payment_preference','region_id']) form.elements[key].value = account.profile?.[key] || '';
  form.elements.phone.value = formatBrazilPhone(account.profile?.phone);
  $('#profile-help').textContent = account.profile ? (hasPayment(account.profile) ? 'Confira seus dados antes de fechar uma encomenda. Alterações valem para os próximos pedidos.' : 'Escolha Pix ou Dinheiro e salve seus dados antes de fechar uma nova encomenda.') : 'Complete seus dados para conseguir fechar sua encomenda. Seu login continua o mesmo.';
  if (!hasPayment(account.profile)) $('#profile-details').open = true;
  $('#checkout-history').innerHTML = account.checkouts.length ? account.checkouts.map(order=>orderCard(order)).join('') : '<p class="empty-history">As encomendas aceitas no site aparecerão aqui.</p>';
  renderCheckout();
}
function renderCheckout() {
  const items = cart();
  if (receipt) {
    $('#checkout-content').innerHTML = `<div role="status"><h3>Pedido aceito! Agora é com a Saints’.</h3><p>Seu pedido está salvo. O pagamento será conferido pela equipe.</p></div>${orderCard(receipt)}<a class="button button-outline" href="./index.html#sabores">Voltar aos cookies</a>`;
    return;
  }
  if (!items.length) {
    $('#checkout-content').innerHTML = '<p>Escolha seus produtos favoritos na loja para preparar uma encomenda.</p><a class="button button-outline" href="./index.html#sabores">Escolher sabores</a>';
    return;
  }
  const total = items.reduce((sum,i)=>sum+products.find(p=>p.id===i.id).price*i.quantity,0);
  const pending = savedIntent();
  const consentChecked = pending?.itemsKey === JSON.stringify(items) && pending.consent === true;
  $('#checkout-content').innerHTML = `<ul class="checkout-items">${items.map(i=>{const p=products.find(p=>p.id===i.id);return `<li><span>${i.quantity}× ${p.name}<small class="checkout-unit">${productUnit(p)}</small></span><strong>${money(p.price*i.quantity)}</strong></li>`;}).join('')}</ul>
    <div id="checkout-fulfillment"></div><div id="checkout-totals"></div>
    <p>Pagamento preferido: <strong>${hasPayment(current.profile) ? payments[current.profile.payment_preference] : 'escolha Pix ou Dinheiro nos seus dados acima'}</strong>.</p>
    <p>Ao confirmar, sua encomenda será aceita imediatamente. Este ambiente é de testes; não há cobrança automática.</p>
    <form id="checkout-form"><label class="check-label"><input name="whatsapp_consent" type="checkbox" ${consentChecked ? 'checked' : ''}><span>Autorizo a Saints’ Cookies a enviar a confirmação e atualizações deste pedido ao meu WhatsApp.</span></label>
    <p class="field-help">Se o envio estiver indisponível, seu pedido continuará salvo e o comprovante ficará disponível aqui. Você também pode encomendar sem receber mensagens.</p>
    <button type="submit" class="button button-primary" ${hasPayment(current.profile) ? '' : 'disabled'}>Confirmar e aceitar encomenda</button></form>
    <p class="field-help">Confira a sacola antes de confirmar. <a href="./index.html#sabores">Alterar minha seleção</a></p>`;
  updateFulfillment(total);
}
function updateFulfillment(total) {
  mountFulfillment($('#checkout-fulfillment'),{account:current,onChange:()=>updateFulfillment(total),onEditAddress:()=>{
    $('#profile-details').open=true;$('#profile-details').scrollIntoView({behavior:'smooth',block:'start'});$('#profile-form').elements.address.focus();
  }});
  $('#checkout-totals').innerHTML=shippingSummary(Math.round(total*100),fulfillmentChoice(current));
  $('#checkout-form [type="submit"]').disabled=!hasPayment(current.profile)||!fulfillmentReady(current);
}
export function renderAdminCheckouts(data) {
  $('#whatsapp-config-status').textContent = data.whatsapp_enabled ? 'Integração do WhatsApp ativada. Consulte abaixo o resultado de cada envio.' : 'O envio automático ainda depende das credenciais e do modelo aprovado no WhatsApp Business. Os pedidos continuam sendo aceitos e salvos.';
  $('#admin-checkouts').innerHTML = data.checkouts.length ? data.checkouts.map(order=>orderCard(order,true)).join('') : '<p class="empty-history">Nenhuma encomenda feita no site ainda.</p>';
}
export function setupCommerce(actions) {
  ({reload,feedback} = actions);
  window.addEventListener('storage',event=>{
    if(event.key!=='saints-fulfillment'||!current||receipt) return;
    const consent=$('#checkout-form [name="whatsapp_consent"]')?.checked;
    renderCheckout();
    const checkbox=$('#checkout-form [name="whatsapp_consent"]');if(checkbox&&consent) checkbox.checked=true;
  });
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
        clearAddressConfirmation();await reload(); $('#profile-details').open = false; feedback('Seus dados foram salvos.');
      } else {
        const items = cart();
        if (!items.length) throw new Error('Sua sacola está vazia. Escolha seus sabores na loja.');
        const consent = form.elements.whatsapp_consent.checked;
        if(!fulfillmentReady(current)) throw new Error('Selecione a região e confirme o endereço de entrega.');
        const fulfillment=fulfillmentRequest(current);
        const pending = intent(items,consent,fulfillment);
        button.textContent = 'Registrando sua encomenda…';
        const result = await api('/checkout',{items,whatsapp_consent:consent,request_key:pending.request_key,fulfillment});
        receipt = result.order;clearAddressConfirmation();
        // Preserve another tab's cart if it was changed while checkout was running.
        if (JSON.stringify(cart()) === JSON.stringify(items)) { try { localStorage.removeItem('saints-bag'); } catch {} }
        try { sessionStorage.removeItem(pending.key); } catch {}
        renderCheckout();
        await reload(); feedback('Encomenda aceita! Seu comprovante está disponível abaixo.');
        $('#checkout-section').scrollIntoView({behavior:'smooth',block:'start'});
      }
    } catch(error) {
      if(form.id==='checkout-form' && [400,401,403,429].includes(error.status)) {
        try {sessionStorage.removeItem(intentStorageKey());await reload();} catch {}
      }
      feedback(error.message,true);
    }
    finally { submitting = false; if(button.isConnected) { button.disabled = false; if(form.id==='checkout-form') button.textContent='Confirmar e aceitar encomenda'; } }
  });
  document.addEventListener('click',async event=>{
    const button = event.target.closest('[data-copy-receipt],[data-retry-receipt],[data-confirm-payment]');
    if(!button || button.disabled) return;
    try {
      if(button.dataset.confirmPayment) {
        if(!confirm('Você conferiu o recebimento do pagamento deste pedido?')) return;
        button.disabled=true;
        await api(`/admin/checkouts/${button.dataset.confirmPayment}/confirm-payment`,{});
        await reload();feedback('Pagamento confirmado.');
      } else if(button.dataset.copyReceipt) {
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
