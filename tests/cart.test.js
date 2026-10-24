import test from 'node:test';
import assert from 'node:assert/strict';
import { products, total, orderText, money } from '../src/products.js';

test('totals a selection with multiple flavors and quantities', () => {
  assert.equal(total({ classic: 2, pistachio: 1 }), 42);
  assert.equal(total({}), 0);
  assert.equal(total({ unknown: 4 }), 0);
});
test('order message includes only selected flavors and asks for confirmation', () => {
  const message = orderText({ classic: 2, hazelnut: 1 });
  assert.match(message, /2× O clássico/);
  assert.match(message, /1× Chocolate & avelã/);
  assert.doesNotMatch(message, /Red velvet/);
  assert.match(message, /confirmar os sabores, valores/);
});
test('all filters have products and prices use Brazilian reais', () => {
  for (const category of ['classic', 'filled', 'special']) assert.ok(products.some(p => p.category === category));
  assert.match(money(12), /R\$\s12,00/);
});
