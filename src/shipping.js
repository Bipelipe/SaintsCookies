// Test prices in centavos. Replace these values with the store's real rates.
export const shippingRegions = [
  ['plano-piloto','Plano Piloto',1000],['gama','Gama',1800],['taguatinga','Taguatinga',1200],
  ['brazlandia','Brazlândia',2500],['sobradinho','Sobradinho',1800],['planaltina','Planaltina',2500],
  ['paranoa','Paranoá',1600],['nucleo-bandeirante','Núcleo Bandeirante',1000],['ceilandia','Ceilândia',1500],
  ['guara','Guará',1000],['cruzeiro','Cruzeiro',1000],['samambaia','Samambaia',1500],
  ['santa-maria','Santa Maria',1800],['sao-sebastiao','São Sebastião',1800],['recanto-das-emas','Recanto das Emas',1600],
  ['lago-sul','Lago Sul',1400],['riacho-fundo','Riacho Fundo',1200],['lago-norte','Lago Norte',1400],
  ['candangolandia','Candangolândia',1000],['aguas-claras','Águas Claras',1200],['riacho-fundo-ii','Riacho Fundo II',1500],
  ['sudoeste-octogonal','Sudoeste/Octogonal',1000],['varjao','Varjão',1600],['park-way','Park Way',1400],
  ['scia-estrutural','SCIA/Estrutural',1200],['sobradinho-ii','Sobradinho II',2000],['jardim-botanico','Jardim Botânico',1800],
  ['itapoa','Itapoã',1800],['sia','SIA',1000],['vicente-pires','Vicente Pires',1200],
  ['fercal','Fercal',2500],['sol-nascente-por-do-sol','Sol Nascente/Pôr do Sol',1800],['arniqueira','Arniqueira',1400],
  ['arapoanga','Arapoanga',2500],['agua-quente','Água Quente',2500],
].map(([id,name,fee_cents])=>({id,name,fee_cents}));

export function shippingQuote(choice) {
  if (choice?.method !== 'delivery') return {fee_cents:0,region:null};
  const region=shippingRegions.find(r=>r.id===choice.region_id);
  return region ? {fee_cents:region.fee_cents,region} : null;
}
export const fulfillmentLabel = order => order.fulfillment === 'delivery'
  ? `Receber em casa · ${order.region_name}` : 'Retirar na loja · local e horário a combinar';
