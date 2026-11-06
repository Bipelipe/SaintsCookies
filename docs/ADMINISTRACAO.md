# Contas, cargos e administração — dev

| Cargo | Acesso |
| --- | --- |
| Admin | Conta pessoal, gestão de todos os pedidos/pagamentos, painel de usuários e cargos, dados cadastrais, histórico por cliente, detalhes das compras, contagem dos registros do banco e histórico de alterações de cargos. |
| Dono | Conta pessoal e gestão das encomendas/pagamentos da loja. Sem painel de usuários, banco ou atribuição de cargos. |
| Cliente | Própria conta, próprios dados e próprias encomendas. |

O painel exclusivo do admin fica em <https://dev.saintscookies.pages.dev/admin>. O link “Administração” aparece em Minha conta apenas para admins. Abrir a URL diretamente como cliente/dono mostra uma mensagem de acesso restrito; a API também rejeita as consultas e alterações com 403. Visitantes sem sessão recebem 401 na API e um link para entrar na conta.

## Ativar no D1 existente

A nova estrutura exige a migração **0003**, que adiciona `account_roles` e `role_changes`. A tabela `users`, suas senhas, sessões, perfis e pedidos permanecem intactos. O cargo efetivo é o atribuído em `account_roles` ou, se ainda não houver atribuição, o cargo anterior de `users`. Isso permite publicar o código sem interromper os logins existentes antes de executar a migração.

1. Cadastre normalmente a conta que será admin, com e-mail e senha escolhidos pelo próprio usuário. Nunca envie a senha no chat.
2. Para atualizar só a estrutura, copie todo o arquivo [D1-ATUALIZACAO-0003.sql](D1-ATUALIZACAO-0003.sql) no Console do D1 `saintscookies-creditos` e execute.
3. Para atualizar a estrutura **e** atribuir o primeiro admin em uma única execução, gere um SQL personalizado fora do repositório público:

```sh
npm run site:roles -- --email conta-admin-ja-cadastrada@exemplo.com --output /tmp/ativar-admin.sql
```

Execute todo o conteúdo desse arquivo no Console do **D1 existente**, mantendo o vínculo `DB` no Preview do Pages `saintscookies`. O arquivo usa SQL sem comentários de linha, compatível com o campo do Console. Ele não contém senhas ou tokens. O e-mail pessoal não é gravado no código público nem usado como regra de promoção durante o cadastro.

Se a conta do admin existir, o SQL atribui Admin a ela e inicializa como Cliente as demais contas que ainda não tenham um cargo atribuído. Atribuições explícitas já existentes são preservadas. Se o e-mail não estiver cadastrado, nenhuma conta é criada/promovida e os cargos anteriores não são normalizados. A consulta final deve retornar o e-mail esperado e `role = admin`. Caso não retorne nenhuma linha, cadastre primeiro a conta e execute o arquivo novamente.

4. Atualize Minha conta ou entre novamente. Abra “Administração”. Não é necessário refazer o deploy após executar esse SQL.
5. Quando a dona da loja se cadastrar, procure seu e-mail no painel, abra **Dados e histórico**, selecione **Dono** e salve. Os demais novos cadastros sempre começam como Cliente.

O comando `npm run site:admin -- --email ... --local` continua disponível para promover uma conta local já cadastrada. Para uma instalação nova, `npm run site:prepare` aplica todas as migrações localmente; o SQL completo [D1-INICIAL.sql](D1-INICIAL.sql) já inclui a nova estrutura.

## Painel

- Pesquisa de contas por nome/e-mail, filtro por cargo e paginação de toda a base.
- Dados cadastrais e lista paginada de todas as compras de cada conta.
- Busca de encomendas por número/nome e filtro por situação do pagamento.
- Links diretos: `/admin?user=<id>` para a conta/histórico e `/admin?order=<id>` para a compra.
- Detalhes da compra com itens, valores e dados do cliente preservados no momento do pedido.
- Confirmação manual do pagamento, com o mesmo controle da gestão de encomendas.
- Visão organizada do banco com contagens das tabelas usadas pelo painel. O painel não é um editor de SQL nem permite consultar sessões ou hashes de senha.
- Alteração de cargos com confirmação, identificação da conta que realizou a mudança e data. O histórico cobre mudanças feitas pelo painel; a configuração inicial feita diretamente pelo Console é uma operação externa ao painel.

As senhas permanecem armazenadas como hash e não são devolvidas pelos endpoints de administração. As permissões são recalculadas a cada solicitação. Um cargo alterado passa a valer nas próximas requisições, sem depender de apagar o armazenamento do navegador. Não é possível remover o próprio cargo de Admin pelo painel; o servidor também revalida a autorização e preserva ao menos um admin ao executar mudanças concorrentes. Uma lista desatualizada retorna 409 para evitar sobrescrever uma alteração recente.

Todas as consultas usam campos explícitos e parâmetros. Os registros pessoais e históricos são restritos ao admin; o Dono recebe os dados necessários para atender os pedidos, sem acesso à lista de logins ou à gestão de cargos. O projeto continua sem sistema de pontos e com a integração Meta em espera.
