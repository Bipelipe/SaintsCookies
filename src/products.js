const biscuitDescription = 'Um biscoito macio e delicado, que derrete na boca a cada mordida. Com um aroma irresistível de manteiga, nossos biscoitos são a combinação perfeita para comer com aquele cafezinho.';

export const products = [
  { id:'brown-butter',name:'Brown butter',description:'Massa tradicional com o surpreendente sabor da manteiga noisette e pedaços de chocolate meio amargo, finalizado com flor de sal.',category:'cookies',price:12,weightGrams:90,saleUnit:'unidade',badge:'Cookie artesanal',style:'classic',image:'flavors.webp',thumbnail:'cookies.webp' },
  { id:'red-velvet',name:'Red velvet',description:'Massa vermelha com a delicadeza e doçura das gotas de chocolate branco.',category:'cookies',price:12,weightGrams:90,saleUnit:'unidade',badge:'Cookie artesanal',style:'redvelvet',image:'flavors.webp',thumbnail:'cookies.webp' },
  { id:'chocolate',name:'Chocolate',description:'Massa de puro cacau com uma explosão de pedaços de chocolate meio amargo.',category:'cookies',price:12,weightGrams:90,saleUnit:'unidade',badge:'Cookie artesanal',style:'double',image:'flavors.webp',thumbnail:'cookies.webp' },
  { id:'amanteigado',name:'Amanteigado',description:biscuitDescription,category:'biscuits',price:12,weightGrams:100,saleUnit:'pote',badge:'Pote de 100 g',style:'biscuit',image:'biscoitos-amanteigado.svg' },
  { id:'amanteigado-canela',name:'Amanteigado de canela',description:'Biscoitos amanteigados de canela para deixar a pausa mais gostosa. Pote de 100 g.',category:'biscuits',price:12,weightGrams:100,saleUnit:'pote',badge:'Pote de 100 g',style:'biscuit',image:'biscoitos-canela.svg' },
  { id:'parmesao',name:'Parmesão',description:biscuitDescription,category:'biscuits',price:15,weightGrams:100,saleUnit:'pote',badge:'Pote de 100 g',style:'biscuit',image:'biscoitos-parmesao.svg' },
];
export const productUnit = product => product.saleUnit === 'pote' ? `Pote de ${product.weightGrams} g` : `Unidade · aprox. ${product.weightGrams} g`;
export const productLabel = product => `${product.name} (${product.saleUnit==='pote'?`pote de ${product.weightGrams} g`:`cookie de aprox. ${product.weightGrams} g`})`;
export const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const total = bag => products.reduce((sum, product) => sum + product.price * (bag[product.id] || 0), 0);
export function orderText(bag) {
  const lines = products.filter(p => bag[p.id]).map(p => `${bag[p.id]}× ${productLabel(p)} — ${money(p.price*bag[p.id])}`);
  return `Olá, Saints’! Gostaria de encomendar estes produtos:\n\n${lines.join('\n')}\n\nTotal dos produtos: ${money(total(bag))}\n\nPodem confirmar a disponibilidade, o prazo e as opções de entrega ou retirada?`;
}
