export const products = [
  { id: 'classic', name: 'O clássico', description: 'Massa de baunilha e generosos pedaços de chocolate meio amargo.', category: 'classic', price: 12, badge: 'O queridinho', style: 'classic' },
  { id: 'hazelnut', name: 'Chocolate & avelã', description: 'Massa douradinha com um coração cremoso de chocolate e avelã.', category: 'filled', price: 16, badge: 'Recheio dos sonhos', style: 'hazelnut' },
  { id: 'redvelvet', name: 'Red velvet', description: 'Massa aveludada de cacau e recheio delicado de cream cheese.', category: 'filled', price: 16, badge: '', style: 'redvelvet' },
  { id: 'pistachio', name: 'Pistache dos céus', description: 'Pistache de verdade e chocolate branco. Um encontro especial.', category: 'special', price: 18, badge: 'Para se apaixonar', style: 'pistachio' },
  { id: 'double', name: 'Duplo chocolate', description: 'Massa intensa de cacau com pedaços de chocolate. Sem economizar.', category: 'classic', price: 14, badge: '', style: 'double' },
  { id: 'dulce', name: 'Doce de leite', description: 'O abraço da massa de baunilha com um recheio bem brasileiro.', category: 'filled', price: 16, badge: '', style: 'dulce' },
];
export const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const total = bag => products.reduce((sum, product) => sum + product.price * (bag[product.id] || 0), 0);
export function orderText(bag) {
  const lines = products.filter(p => bag[p.id]).map(p => `${bag[p.id]}× ${p.name}`);
  return `Olá, Saints’! Gostaria de consultar estes cookies:\n\n${lines.join('\n')}\n\nPodem confirmar os sabores, valores, prazo e opções de entrega ou retirada?`;
}
