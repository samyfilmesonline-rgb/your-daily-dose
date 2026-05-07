Diagnóstico:
- O erro real nos logs da Edge Function `partner-shop-create-pix` é: `AbacatePay create [422]: {"success":false,"data":null,"error":"Value should be one of 'object', 'object'"}`.
- A função da loja que já funciona (`abacatepay-create-pix` / `loja-create-pix`) chama o helper `createPixCharge` sem `metadata`.
- O checkout do parceiro chama a mesma API v2, mas adiciona `metadata: { partnerId, packId }`. Pela mensagem 422, o gateway está rejeitando algum campo extra/estrutura da payload v2. Como o pedido já salva `partner_id`, `pack_id` e `tx_id` no Supabase, esse `metadata` não é necessário.

Plano de correção:
1. Alterar `supabase/functions/partner-shop-create-pix/index.ts` para usar a mesma payload enviada pela loja:
   - `amount`
   - `expiresIn`
   - `description`
   - `customer: { name, email, taxId, cellphone? }`
   - remover `metadata` completamente.
2. Manter o insert em `partner_credit_orders` igual ao schema real existente:
   - `partner_id`, `pack_id`, dados do cliente, créditos, valor, `tx_id`, QR Code, copia-e-cola, expiração, `status: pending`, `raw_payload`.
3. Melhorar a mensagem de erro retornada pela Edge Function sem expor segredos:
   - continuar logando o erro técnico no Supabase.
   - retornar uma mensagem clara para o frontend quando o gateway recusar a criação do Pix.
4. Não alterar tabelas, RLS, nomes de colunas, nem fluxo de atribuição de bot.
5. Validar depois da implementação:
   - checar que não há `metadata` na criação Pix do parceiro.
   - testar/chamar a Edge Function se possível com payload equivalente ao formulário.
   - conferir logs para confirmar que o 422 da AbacatePay não reaparece.