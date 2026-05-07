# Plano C — Permitir usar saldo com outro e-mail (transferência/uso cruzado)

## Objetivo
Hoje o saldo do cliente fica vinculado a `partner_id + customer_email`. Se o cliente fizer um novo pedido com outro e-mail, ele não enxerga nem consegue usar o saldo do pedido antigo. O Plano C resolve isso permitindo que o cliente consulte o saldo pelo e-mail original e o aplique no novo pedido (com outro e-mail), de forma segura.

## Como vai funcionar para o cliente

1. Na página `/comprar/:partnerSlug`, na aba **Meus pedidos** e no checkout, aparece um botão **"Tenho saldo em outro e-mail"**.
2. Cliente informa o e-mail antigo. Se houver saldo daquele parceiro vinculado àquele e-mail **e** o `client_fingerprint` (mesmo navegador/máquina) bater com o registrado no saldo, o sistema:
   - mostra "Saldo encontrado: X créditos no e-mail antigo@…";
   - oferece **vincular ao e-mail atual** (transferência) ou **aplicar somente neste pedido**.
3. Se o fingerprint não bater, exige uma verificação extra: código de 6 dígitos enviado por e-mail para o endereço antigo (one-time, 10 min). Após confirmar, libera transferência/uso.
4. Após transferência, o saldo passa a viver em `partner_id + novo_email`, e o ledger registra a operação para auditoria.

## Fluxos suportados

- **A. Mesmo dispositivo, e-mail diferente:** auto-libera por fingerprint, 1 clique para transferir ou aplicar.
- **B. Dispositivo diferente:** exige código por e-mail no endereço antigo.
- **C. Aplicar sem transferir:** consome créditos do saldo antigo direto no novo pedido (não move o saldo, só debita), útil quando cliente quer manter contas separadas.

## Mudanças técnicas

### Banco (migration)
- Nova função `request_balance_transfer_code(_partner_id, _from_email, _fingerprint)`:
  - se fingerprint do saldo bate com o informado → retorna `{ requires_code: false, balance: N }`;
  - senão gera código 6 dígitos, grava em nova tabela `partner_balance_transfer_codes` (`partner_id, from_email, code_hash, expires_at, consumed_at`) e retorna `{ requires_code: true, balance: N }` (a edge function dispara o e-mail).
- Nova função `confirm_balance_transfer(_partner_id, _from_email, _to_email, _fingerprint, _code, _mode)`:
  - valida fingerprint OU código (consome o código);
  - `_mode = 'transfer'`: move créditos de `(partner, from_email)` para `(partner, to_email)`, com 2 entradas no ledger (`transfer_out` / `transfer_in`);
  - `_mode = 'apply'`: marca uma "autorização" temporária (ver abaixo) e retorna um `authorization_token` válido por 15 min e específico para `(partner, from_email, to_email, fingerprint)`.
- Nova tabela `partner_balance_apply_authorizations` (`token_hash, partner_id, from_email, to_email, fingerprint, max_credits, expires_at, used_at`) para o modo "apply only".
- Atualizar `apply_balance_to_order` para aceitar parâmetro opcional `_authorization_token`. Se presente, debita do saldo de `from_email` em vez do `customer_email` do pedido, validando token + expiração + max_credits.

### Edge functions
- **Nova `partner-shop-balance-transfer`** com 2 ações:
  - `request`: chama `request_balance_transfer_code`, se `requires_code=true` envia e-mail (via Resend ou função de e-mail já existente; se não houver, fica `console.log` + retorna o código apenas em ambiente de teste — perguntar ao usuário antes de configurar Resend).
  - `confirm`: chama `confirm_balance_transfer` e retorna saldo atualizado ou `authorization_token`.
- **`partner-shop-create-pix`**: aceitar opcional `balanceAuthorizationToken` + `balanceFromEmail`. Quando presente, calcular `availableBalance` a partir do saldo de `from_email` (validando token) e gravar token + from_email no `raw_payload` para o webhook consumir.
- **`abacatepay-webhook`**: ao confirmar pagamento, se houver `balanceAuthorizationToken` no payload, chamar `apply_balance_to_order` passando o token (debita do `from_email`).
- **`partner-shop-list-orders`**: aceitar `extraEmails: string[]` para somar/listar saldos de e-mails adicionais (autorizados via fingerprint ou código nesta sessão; lista guardada em `localStorage`).

### Frontend (`src/pages/ComprarParceiro.tsx`)
- Novo componente `BalanceTransferDialog`:
  - input "e-mail antigo" → chama `request`;
  - se `requires_code=false`: mostra saldo + 2 botões: "Transferir para meu e-mail atual" / "Usar somente neste pedido";
  - se `requires_code=true`: input do código → `confirm`.
- Botão "Tenho saldo em outro e-mail" no card de saldo e no checkout.
- Após `confirm` no modo `apply`: salva `{ fromEmail, token, expiresAt, maxCredits }` em estado e em `localStorage` (chave por parceiro). Checkout passa para `create-pix`.
- Após `confirm` no modo `transfer`: refetch dos saldos, toast de sucesso.
- Persistir lista de "e-mails liberados nesta sessão" em `localStorage` para enriquecer `list-orders`.

## Segurança
- Fingerprint sozinho não é prova forte, mas combinado com posse do saldo + ledger auditável reduz fricção sem expor terceiros (atacante precisaria do mesmo navegador/máquina **e** saber o e-mail).
- Quando fingerprint não bate, exige código no e-mail original (posse comprovada).
- Códigos: 6 dígitos, hash (sha256) no banco, expiração 10 min, single-use, rate-limit por `(partner_id, from_email)` (máx 5/h).
- Tokens de "apply": hash no banco, single-use, expira em 15 min, vinculados a `to_email + fingerprint + max_credits`.
- RLS: novas tabelas só legíveis por admin; clientes operam exclusivamente via edge functions (service role).

## Pergunta antes de implementar
A entrega de e-mail (código de verificação) precisa de um provedor. Posso:
- (1) usar **Resend** (você precisa conectar/forneça API key) — recomendado;
- (2) reaproveitar algum envio de e-mail já existente no projeto (não vi nenhum nas edge functions atuais);
- (3) por enquanto **não enviar e-mail** e exigir somente fingerprint (modo B desabilitado) — mais simples, mas se o cliente trocar de máquina perde acesso ao saldo.

Qual prefere?
