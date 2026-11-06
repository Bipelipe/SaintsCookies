import test from 'node:test';
import assert from 'node:assert/strict';
import {products,total,orderText,money,productUnit} from '../src/products.js';

test('totals cookie units and biscuit pots using the actual menu prices',()=>{
  assert.equal(total({'brown-butter':2,parmesao:1}),39);
  assert.equal(total({amanteigado:2,'amanteigado-canela':1}),36);
  assert.equal(total({}),0);assert.equal(total({unknown:4,classic:2,hazelnut:1}),0);
});
test('copied selection identifies cookie units, biscuit pots and their subtotal',()=>{
  const message=orderText({'brown-butter':2,parmesao:1});
  assert.match(message,/2× Brown butter \(cookie de aprox\. 90 g\)/);
  assert.match(message,/1× Parmesão \(pote de 100 g\)/);
  assert.match(message,/Total dos produtos: R\$\s39,00/);
  assert.doesNotMatch(message,/avelã|pistache|doce de leite/i);
  assert.match(message,/confirmar a disponibilidade/);
});
test('the real catalog distinguishes approximate cookie weight from biscuit pot content',()=>{
  const cookies=products.filter(p=>p.category==='cookies'),biscuits=products.filter(p=>p.category==='biscuits');
  assert.deepEqual(cookies.map(p=>p.name),['Brown butter','Red velvet','Chocolate']);
  assert.deepEqual(biscuits.map(p=>p.name),['Amanteigado','Amanteigado de canela','Parmesão']);
  for(const product of cookies){assert.equal(product.price,12);assert.equal(productUnit(product),'Unidade · aprox. 90 g');}
  for(const product of biscuits){assert.equal(product.price,product.id==='parmesao'?15:12);assert.equal(productUnit(product),'Pote de 100 g');}
  assert.match(money(12),/R\$\s12,00/);
});
