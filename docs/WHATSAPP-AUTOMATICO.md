# Encomendas e comprovante automático — branch creditos

O cliente escolhe os cookies, entra na conta, confere os dados e clica em **Confirmar e aceitar encomenda**. O servidor calcula os preços pelo catálogo, aceita a encomenda imediatamente e salva itens, valores, nome, telefone, endereço e pagamento preferido. O comprovante fica no clube, inclusive quando o WhatsApp falha.

**Aceitar não é cobrar.** O pagamento fica pendente. A equipe confere o recebimento no painel e só então libera pontos (cada real inteiro = 1 ponto). O cadastro pede nome, e-mail, senha, telefone brasileiro com DDD, endereço completo e preferência entre Pix, crédito, débito e dinheiro. Nenhum dado de cartão é coletado. Contas antigas mantêm senha e pontos; basta completar os dados em “Meus dados para encomendas”. O login continua usando e-mail e senha.

Nesta implementação de teste, o atendimento é por **retirada**, com horário a combinar. Não foi inventada uma taxa de entrega ou um prazo. Antes de vender de verdade, precisamos definir catálogo e preços oficiais, disponibilidade, local/horários de retirada e, se desejado, área, preço e prazo da entrega.

## Tabela de informações e tarefas externas

| Informação / configuração | O que você precisa fazer por fora | Onde colocar / o que me informar |
| --- | --- | --- |
| Banco D1 de testes | Abrir **Storage & databases → D1 → saintscookies-creditos → Console** e executar **todo** o arquivo [CREDITOS-D1-ATUALIZACAO-0002.sql](CREDITOS-D1-ATUALIZACAO-0002.sql). Ele adiciona tabelas, sem apagar contas ou pontos, e pode ser repetido. | Banco existente `0e7de326-abe6-4f13-921f-6d2d1d107d47`, vínculo `DB` no Preview do Pages `saintscookies`. Avise quando concluir. Não precisa enviar dados de clientes. |
| Conta empresarial da Meta e aplicativo | Acessar [Meta for Developers](https://developers.facebook.com/), criar/configurar um app empresarial com WhatsApp e uma conta WhatsApp Business. Cumprir as verificações que o painel exigir. | Pode informar o estágio da configuração e o nome do app. Senha da Meta não é necessária. |
| Número da empresa | Na configuração do WhatsApp do app, cadastrar/verificar o número remetente. Verificar com a Meta a disponibilidade de coexistência com o aplicativo WhatsApp Business; não remover/migrar o número atual antes de entender o efeito. | Informar qual número deseja usar e se precisa continuar usando o aplicativo no celular. O código usa o **Phone Number ID**, que é diferente do número de telefone. |
| `WHATSAPP_PHONE_NUMBER_ID` | Copiar o identificador do número no painel WhatsApp/API Setup. | Variável de texto do Pages **Preview**. Pode informar esse ID aqui. |
| `WHATSAPP_ACCESS_TOKEN` | Criar um token de sistema adequado à conta/número, com permissão `whatsapp_business_messaging`; atribuir os ativos ao usuário de sistema. Evitar token temporário de demonstração para uso contínuo. | **Secret criptografado** no Pages Preview. Não envie no chat, GitHub, código ou print. |
| `WHATSAPP_GRAPH_VERSION` | Consultar no painel/documentação da Meta uma versão Graph API suportada pela sua configuração, no formato `vNN.N`. | Variável de texto no Pages Preview. Pode informar a versão aqui. O código exige uma versão explícita. |
| `WHATSAPP_TEMPLATE_NAME` | Criar e submeter o modelo abaixo no WhatsApp Manager, categoria proposta **Utility**, sem publicidade. A categoria/aprovação final é da Meta. | Variável de texto no Pages Preview com o nome **exato** aprovado, por exemplo `saints_pedido_aceito`. Pode informar aqui. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Criar o idioma do modelo, por exemplo Português (Brasil). Manter modelo de texto com **8 variáveis no corpo**, sem cabeçalho, botões ou variáveis adicionais. | Variável de texto `pt_BR` (ou código exato do idioma aprovado). Pode informar aqui. |
| `WHATSAPP_APP_SECRET` | Copiar o App Secret nas configurações do aplicativo Meta. Ele valida a assinatura dos eventos recebidos. | **Secret criptografado** no Pages Preview. Não envie aqui. |
| `WHATSAPP_VERIFY_TOKEN` | Gerar uma sequência aleatória longa, exclusiva para validar a configuração do webhook. Usar a mesma sequência nos dois painéis. | **Secret criptografado** no Pages Preview e campo Verify Token no painel Meta. Não envie aqui. |
| Webhook | Configurar a URL abaixo no app Meta, validar com o Verify Token e assinar o campo **messages**. Confirmar que o app está inscrito na conta WhatsApp Business correspondente (se não estiver, fazer a inscrição no painel/API oficial). | `https://creditos.saintscookies.pages.dev/api/whatsapp/webhook`. A URL precisa estar acessível à Meta, sem tela de login do Cloudflare Access. |
| `WHATSAPP_ENABLED` | Manter `false` enquanto prepara a integração. Após configurar tudo e aprovar o modelo, trocar para `true`. | Variável de texto no Pages Preview. As demais credenciais também precisam existir para o envio ser ativado. |
| Cobrança da Meta e destinatários de teste | Consultar [preços oficiais](https://developers.facebook.com/docs/whatsapp/pricing/) e cadastrar pagamento quando exigido. Com o número de teste da Meta, adicionar/verificar os destinatários permitidos no painel. | Configuração na Meta, sem dados de cartão neste site. A integração pode gerar custos da Meta. |
| Dados comerciais | Confirmar preços/sabores oficiais, disponibilidade, local e horários da retirada. Definir política de atendimento/cancelamento e aviso de privacidade com os dados reais da empresa. | Pode enviar esses dados comerciais aqui. O catálogo atual continua de demonstração. Entrega e cobrança automática exigem uma etapa adicional. |

Na Cloudflare, essas variáveis e secrets pertencem a **Workers & Pages → saintscookies (Pages) → Settings → Variables and Secrets → Preview**, e não ao Worker separado `saintscookies-creditos`. Os nomes exatos dos menus podem variar. Salve e refaça o deployment de `creditos` para aplicar alterações de variáveis/secrets. O vínculo `DB` já está no `wrangler.jsonc`, apenas em Preview; não vincule o banco de teste a Production.

O **WABA ID** (identificador da conta WhatsApp Business) pode ser útil para administrar a conta, aprovar modelos e inscrever o app. O envio implementado usa o Phone Number ID; não existe variável obrigatória `WHATSAPP_BUSINESS_ACCOUNT_ID` neste código.

## Modelo a solicitar à Meta

Nome sugerido: `saints_pedido_aceito`. Idioma: `pt_BR`. Corpo, com oito parâmetros na ordem abaixo:

```text
Olá, {{1}}! Sua encomenda {{2}} foi aceita pela Saints’ Cookies.
Itens: {{3}}
Total dos cookies: {{4}}
Pagamento preferido: {{5}}
Atendimento: {{6}}
Endereço cadastrado: {{7}}
Situação: {{8}}
Combine o horário de retirada com a nossa equipe. Os pontos entram após a conferência do pagamento.
```

Exemplos fictícios para o pedido de aprovação:

| Parâmetro | Conteúdo | Exemplo fictício |
| --- | --- | --- |
| 1 | Nome do cliente | Ana de Teste |
| 2 | Número do pedido | SC-1234567890ABCDEF1234567890ABCDEF |
| 3 | Quantidades e sabores, em uma linha | 2x O clássico; 1x Chocolate & avelã |
| 4 | Total em reais | R$ 40,00 |
| 5 | Pagamento preferido | Pix |
| 6 | Forma de atendimento | Retirada com a Saints’ |
| 7 | Endereço cadastrado | Rua de Exemplo, 123, Centro, São Paulo, SP, 01000-000 |
| 8 | Situação | Aceito; pagamento pendente |

O modelo é uma confirmação da encomenda, sem alegação de pagamento recebido. Não é nota fiscal. O endereço é apenas o cadastrado pelo cliente; o atendimento desta versão é retirada. O cliente escolhe, com uma caixa inicialmente desmarcada, se autoriza as mensagens sobre aquele pedido. Não há disparo de marketing e não se presume autorização a partir do cadastro.

## O que testar após configurar

Se o Console apresentar `no such table: d1_migrations`, copie novamente o arquivo **CREDITOS-D1-ATUALIZACAO-0002.sql** atualizado e execute o conteúdo inteiro no banco existente. A versão corrigida cria a tabela de controle se ela estiver ausente. Pode executar novamente mesmo que parte das tabelas já exista; os dados existentes são preservados. Não é necessário refazer o deploy após executar o SQL: atualize o site e consulte `/api/checkout/config`.

Se aparecer `No SQL statements detected`, confira se você colou o conteúdo no **campo de comandos ao lado do botão Execute**, em vez da área de histórico acima. Os arquivos SQL para o Console não contêm comentários `--`, pois a colagem em um campo de uma linha pode fazer um comentário ocultar todos os comandos. Abra a versão atualizada pelo botão **Raw**, copie tudo e cole no campo de comandos. O SQL incremental deve começar com `CREATE TABLE IF NOT EXISTS d1_migrations`. Após executar, verifique se `/api/checkout/config` retorna `"ready": true`.

1. Executar o SQL 0002 e consultar `/api/checkout/config`: `ready` deve ser `true`. O sistema antigo continua permitindo login antes da migração; novos cadastros e o fechamento aguardam essa atualização.
2. Cadastrar uma conta de teste com telefone **seu**, habilitado como destinatário caso use o número de teste da Meta. Escolher cookies, acessar “Fechar pedido”, conferir os dados e autorizar a confirmação por WhatsApp.
3. Confirmar a encomenda. Deve aparecer “Encomenda aceita”, valor calculado pelo servidor e pagamento pendente. O WhatsApp deve receber o modelo aprovado. Enquanto faltarem configurações, o pedido fica aceito e o status informa que o WhatsApp ainda não foi ativado.
4. Conferir no painel administrativo os itens, telefone, endereço e resultado do envio. `submitted` significa aceito pela API; somente eventos assinados do webhook mudam para `delivered` ou `read`. O painel é atualizado pelo botão de atualizar, não por atualização em tempo real.
5. Confirmar o pagamento e liberar os pontos pelo formulário de conferência. Para pedidos do site, o valor e a referência `web-<id>` são fixos. A confirmação não cobra Pix/cartão: o recebimento é conferido fora do site.
6. Testar clique repetido, nova tentativa após resposta perdida e uma falha de envio. O mesmo pedido não deve ser criado novamente com a mesma referência. Confira também uma encomenda **sem** autorizar WhatsApp: ela deve ser aceita sem nenhum disparo.

## Falhas, reenvio e limites desta versão

O pedido, os itens, a compra para futura conferência de pontos e uma linha de envio persistente (`whatsapp_outbox`) são gravados juntos. Uma falha da Meta não desfaz o pedido. O backend tenta enviar imediatamente, com limite de oito segundos para a chamada externa. Cliques simultâneos não fazem dois envios para a mesma linha.

Não existe agendador de reenvio no Pages nesta etapa. Envio não configurado ou rejeitado pode ser tentado pelo botão administrativo. Se uma conexão termina sem resposta, não é possível saber se a Meta aceitou a mensagem; o estado fica “em verificação”. Antes de reenviar, a equipe deve conferir a conversa e reconhecer o risco de duplicação. A API da Meta não fornece uma chave de idempotência neste fluxo. Um envio que permaneça “em andamento” por mais de cinco minutos também exige essa conferência. Um envio já aceito/entregue/lido não é reenviado pelo botão.

Somente o proprietário da conta e administradores veem seus comprovantes/dados; webhook exige assinatura HMAC do App Secret, e tokens nunca são enviados ao frontend. O endpoint do webhook atualiza apenas o resultado da mensagem; não aceita encomendas, não confirma pagamento e não libera pontos. Esta versão não verifica a titularidade do telefone por OTP e não implementa cancelamento/reembolso, agenda de produção ou cálculo de frete.

## Desenvolvimento

`npm run credits:db` aplica ambas as migrações apenas ao banco local. `npm run credits:sql` gera o SQL completo para instalação nova e o SQL incremental 0002 para o banco existente. `npm test`, `npm run test:creditos` e `npm run test:creditos:pages` verificam também o fechamento. Os testes de mensagens usam transporte simulado, sem telefone real, token real ou custo de envio. A publicação por push não executa migrações remotas nem configura a conta Meta.
