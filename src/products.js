export const products = [
  { id:'brown-butter',name:'Brown butter',description:'Nosso cookie Brown butter, feito artesanalmente para uma pausa especial.',category:'cookies',price:12,weightGrams:90,saleUnit:'unidade',badge:'Cookie artesanal',style:'classic',image:'flavors.webp',thumbnail:'cookies.webp' },
  { id:'red-velvet',name:'Red velvet',description:'O sabor Red velvet em um cookie artesanal para saborear com calma.',category:'cookies',price:12,weightGrams:90,saleUnit:'unidade',badge:'Cookie artesanal',style:'redvelvet',image:'flavors.webp',thumbnail:'cookies.webp' },
  { id:'chocolate',name:'Chocolate',description:'Um cookie artesanal para quem sempre escolhe chocolate.',category:'cookies',price:12,weightGrams:90,saleUnit:'unidade',badge:'Cookie artesanal',style:'double',image:'flavors.webp',thumbnail:'cookies.webp' },
  { id:'amanteigado',name:'Amanteigado',description:'Biscoitos amanteigados para acompanhar seu café. Vendidos em pote de 100 g.',category:'biscuits',price:12,weightGrams:100,saleUnit:'pote',badge:'Pote de 100 g',style:'biscuit',image:'biscoitos-amanteigado.svg' },
  { id:'amanteigado-canela',name:'Amanteigado de canela',description:'Biscoitos amanteigados de canela para deixar a pausa mais gostosa. Pote de 100 g.',category:'biscuits',price:12,weightGrams:100,saleUnit:'pote',badge:'Pote de 100 g',style:'biscuit',image:'biscoitos-canela.svg' },
  { id:'parmesao',name:'Parmesão',description:'A opção salgada do nosso cardápio: biscoitos de parmesão em pote de 100 g.',category:'biscuits',price:15,weightGrams:100,saleUnit:'pote',badge:'Pote de 100 g',style:'biscuit',image:'biscoitos-parmesao.svg' },
];
export const productUnit = product => product.saleUnit === 'pote' ? `Pote de ${product.weightGrams} g` : `Unidade · aprox. ${product.weightGrams} g`;
export const productLabel = product => `${product.name} (${product.saleUnit==='pote'?`pote de ${product.weightGrams} g`:`cookie de aprox. ${product.weightGrams} g`})`;
export const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const total = bag => products.reduce((sum, product) => sum + product.price * (bag[product.id] || 0), 0);
export function orderText(bag) {
  const lines = products.filter(p => bag[p.id]).map(p => `${bag[p.id]}× ${productLabel(p)} — ${money(p.price*bag[p.id])}`);
  return `Olá, Saints’! Gostaria de encomendar estes produtos:\n\n${lines.join('\n')}\n\nTotal dos produtos: ${money(total(bag))}\n\nPodem confirmar a disponibilidade, o prazo e as opções de entrega ou retirada?`;
}
