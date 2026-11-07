import { shippingRegions,shippingQuote } from './shipping.js';
import { money } from './products.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const choiceKey='saints-fulfillment',confirmationKey='saints-delivery-confirmation';
export function fulfillmentChoice() {
  try {
    const saved=JSON.parse(localStorage.getItem(choiceKey));
    if(saved?.method==='delivery') return {method:'delivery',region_id:typeof saved.region_id==='string'?saved.region_id:''};
  } catch {}
  return {method:'pickup'};
}
export function clearAddressConfirmation() { try {sessionStorage.removeItem(confirmationKey);} catch {} }
function confirmed(account) {
  try {
    const value=JSON.parse(sessionStorage.getItem(confirmationKey));
    return Boolean(account?.profile?.address && value?.user_id===account.user.id && value.address===account.profile.address);
  } catch {return false;}
}
export function fulfillmentRequest(account) {
  const choice=fulfillmentChoice();
  if(choice.method==='pickup') return choice;
  return {...choice,address_confirmed:confirmed(account),confirmed_address:confirmed(account)?account.profile.address:'',expected_shipping_cents:shippingQuote(choice)?.fee_cents??null};
}
export function fulfillmentReady(account) {
  const choice=fulfillmentChoice();
  return choice.method==='pickup' || Boolean(shippingQuote(choice)&&confirmed(account));
}
export function shippingSummary(productsCents,choice=fulfillmentChoice()) {
  const quote=shippingQuote(choice),delivery=choice.method==='delivery';
  return `<div class="order-totals" aria-live="polite"><div class="subtotal"><span>Total dos produtos</span><strong>${money(productsCents/100)}</strong></div>
    ${delivery?`<div class="shipping-line"><span>Frete${quote?` · ${escape(quote.region.name)}`:''}</span><strong>${quote?money(quote.fee_cents/100):'Selecione a RA'}</strong></div><p class="shipping-test-note">Frete fictício para testes. Os valores reais serão definidos pela Saints’.</p><div class="grand-total"><span>Total com frete</span><strong>${quote?money((productsCents+quote.fee_cents)/100):'A calcular'}</strong></div>`:''}</div>`;
}

export function mountFulfillment(container,{account,loading=false,onChange=()=>{},onEditAddress}={}) {
  const choice=fulfillmentChoice(),id=container.id,delivery=choice.method==='delivery';
  container.innerHTML=`<section class="fulfillment-picker" aria-label="Como quer receber seu pedido?"><h3>Como quer receber seu pedido?</h3>
    <fieldset class="fulfillment-methods"><legend class="visually-hidden">Retirada ou entrega</legend>
    <label><input type="radio" name="${id}-method" value="pickup" ${delivery?'':'checked'}><span>Retirar na loja<small>Sem taxa de frete · horário a combinar</small></span></label>
    <label><input type="radio" name="${id}-method" value="delivery" ${delivery?'checked':''}><span>Receber em casa<small>Entrega nas regiões administrativas do DF</small></span></label></fieldset>
    ${delivery?`<div class="delivery-fields"><label for="${id}-region">RA do endereço de entrega</label><select id="${id}-region" data-delivery-region><option value="">Selecione sua região</option>${[...shippingRegions].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(r=>`<option value="${r.id}" ${choice.region_id===r.id?'selected':''}>${escape(r.name)} · ${money(r.fee_cents/100)}</option>`).join('')}</select><p class="shipping-test-note">Valores de frete fictícios para testes.</p>
    ${loading?'<p role="status">Buscando seu endereço cadastrado…</p>':account?.profile?.address?`<div class="address-confirmation"><p><strong>Seu endereço ainda é este?</strong></p><p class="delivery-address">${escape(account.profile.address)}</p><label class="address-check"><input type="checkbox" data-confirm-address ${confirmed(account)?'checked':''}><span>Sim, este é meu endereço de entrega.</span></label>${onEditAddress?'<button type="button" class="text-link" data-edit-address>Não, quero atualizar o endereço</button>':'<a class="text-link" data-edit-address href="./conta.html?checkout=1&editar-endereco=1#profile-details">Não, quero atualizar o endereço</a>'}</div>`:`<p>Entre na sua conta para confirmar o endereço cadastrado.</p><a class="text-link" href="./conta.html?checkout=1">${account?'Completar meu endereço':'Entrar ou criar minha conta'}</a>`}</div>`:''}</section>`;
  container.onchange=event=>{
    const target=event.target;
    if(target.matches('input[type="radio"], [data-delivery-region]')) {
      const next=target.matches('input[type="radio"]')?{method:target.value,...(target.value==='delivery'?{region_id:choice.region_id||''}:{})}:{...choice,region_id:target.value};
      try {localStorage.setItem(choiceKey,JSON.stringify(next));} catch {}
      if(next.method==='pickup') clearAddressConfirmation();
    } else if(target.matches('[data-confirm-address]')) {
      clearAddressConfirmation();
      if(target.checked && account?.profile?.address) try {sessionStorage.setItem(confirmationKey,JSON.stringify({user_id:account.user.id,address:account.profile.address}));} catch {}
    } else return;
    onChange();
    const selector=target.matches('[data-delivery-region]')?'[data-delivery-region]':target.matches('[data-confirm-address]')?'[data-confirm-address]':`input[type="radio"][value="${target.value}"]`;
    container.querySelector(selector)?.focus();
  };
  container.onclick=event=>{
    if(event.target.closest('[data-edit-address]')) {
      clearAddressConfirmation();
      if(onEditAddress) {event.preventDefault();onEditAddress();}
    }
  };
}
