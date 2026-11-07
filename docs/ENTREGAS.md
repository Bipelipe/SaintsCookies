# Retirada e entrega

A implementação está apenas na branch dev. Os valores abaixo são fictícios e não representam uma cotação real de entrega.

## Fluxo do cliente

- Na sacola, a aba Produtos mantém os itens e a aba Retirada ou entrega oferece as duas modalidades.
- Retirar na loja tem frete zero e não pergunta se o endereço ainda é o mesmo. Local e horário ficam a combinar até a loja informar os dados oficiais.
- Receber em casa exige a RA do endereço e a resposta à pergunta “Seu endereço ainda é este?”. Quem ainda não entrou é direcionado à conta para confirmar o endereço cadastrado.
- “Não, quero atualizar o endereço” abre a edição do cadastro. Após salvar, é necessário confirmar o endereço novo. O servidor compara o endereço confirmado com o cadastro atual antes de aceitar um pedido.
- Produtos, frete por RA e total aparecem no fim da sacola e no fechamento. O histórico, comprovante e painel guardam o frete e o endereço daquele pedido. Pedidos antigos continuam com seus dados originais.
- A confirmação de endereço é temporária, vinculada ao usuário e ao endereço da sessão; ela é limpa ao sair, atualizar o cadastro ou concluir o pedido. O endereço não é guardado no localStorage.

## Substituir os fretes de teste

Edite a tabela shippingRegions de src/shipping.js. O campo fee_cents é inteiro em centavos: 1500 significa R$ 15,00. A tabela é compartilhada pelo frontend e pelo servidor. Depois de definir os valores oficiais, atualize também os avisos de teste e esta documentação. Não há cálculo por GPS, CEP ou distância: o cliente escolhe manualmente a RA do endereço.

| Região administrativa | Frete fictício |
|---|---:|
| Plano Piloto | R$ 10,00 |
| Gama | R$ 18,00 |
| Taguatinga | R$ 12,00 |
| Brazlândia | R$ 25,00 |
| Sobradinho | R$ 18,00 |
| Planaltina | R$ 25,00 |
| Paranoá | R$ 16,00 |
| Núcleo Bandeirante | R$ 10,00 |
| Ceilândia | R$ 15,00 |
| Guará | R$ 10,00 |
| Cruzeiro | R$ 10,00 |
| Samambaia | R$ 15,00 |
| Santa Maria | R$ 18,00 |
| São Sebastião | R$ 18,00 |
| Recanto das Emas | R$ 16,00 |
| Lago Sul | R$ 14,00 |
| Riacho Fundo | R$ 12,00 |
| Lago Norte | R$ 14,00 |
| Candangolândia | R$ 10,00 |
| Águas Claras | R$ 12,00 |
| Riacho Fundo II | R$ 15,00 |
| Sudoeste/Octogonal | R$ 10,00 |
| Varjão | R$ 16,00 |
| Park Way | R$ 14,00 |
| SCIA/Estrutural | R$ 12,00 |
| Sobradinho II | R$ 20,00 |
| Jardim Botânico | R$ 18,00 |
| Itapoã | R$ 18,00 |
| SIA | R$ 10,00 |
| Vicente Pires | R$ 12,00 |
| Fercal | R$ 25,00 |
| Sol Nascente/Pôr do Sol | R$ 18,00 |
| Arniqueira | R$ 14,00 |
| Arapoanga | R$ 25,00 |
| Água Quente | R$ 25,00 |

## Banco e compatibilidade

A migração 0004 acrescenta somente checkout_fulfillment, sem reescrever tabelas ou pedidos. A tabela contém a modalidade, subtotal dos produtos, frete, RA, endereço de entrega e instante da confirmação. O total permanece em checkout_orders.amount_cents e no registro de pagamento vinculado.

A coluna antiga checkout_orders.fulfillment, restrita a pickup por uma regra do esquema anterior, é preservada apenas por compatibilidade. A nova tabela é a fonte da modalidade para pedidos novos; as APIs e telas a consultam. Sem linha na extensão, um pedido antigo é tratado como retirada, com frete zero e subtotal igual ao total original.

O servidor executa somente o CREATE TABLE IF NOT EXISTS fixo em worker/shipping-schema.js ao usar o fechamento/histórico ou GET /api/checkout/config. Essa atualização aditiva permite publicar na prévia com o vínculo D1 existente, sem token extra ou intervenção manual. O endpoint retorna apenas configuração pública. A criação é repetível e não muda o histórico de migrações.

Para instalações administradas por Wrangler, migrations/0004_checkout_fulfillment.sql aplica a mesma extensão. Para o Console D1, docs/D1-ATUALIZACAO-0004.sql também registra a migração e pode ser repetido. O SQL inicial completo já inclui a tabela. O banco e vínculo existentes mantêm seus nomes.

O servidor escolhe o frete pela RA, ignora preços enviados pelo cliente e exige que o frete esperado ainda corresponda à tabela. Produtos, frete, pagamento e comprovante são gravados no mesmo lote atômico. Retentativas preservam a cotação e o endereço originais e não criam outro pedido.

A integração Meta continua desativada; nenhum envio real é necessário para testar retirada ou entrega.
