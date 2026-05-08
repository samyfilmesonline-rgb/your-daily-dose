## Objetivo

Permitir que parceiros (e admins) criem e iniciem recargas manualmente direto da página **/dashboard/pedidos**, escolhendo um bot específico. Se o bot estiver ocioso, o farm começa imediatamente; se estiver ocupado, o pedido entra na fila do parceiro e é puxado automaticamente quando o bot liberar (mesma fila já existente).

## Fluxo de usuário

1. Na página **Pedidos**, novo botão **"Nova recarga manual"** no topo (ao lado da busca).
2. Abre dialog com:
   - Nome do cliente, e-mail, WhatsApp (opcional)
   - Workspace alvo (obrigatório)
   - Créditos (número, > 0)
   - Valor manual em R$ (apenas registro financeiro, sem PIX)
   - Observações (motivo da recarga manual)
   - Select **Bot**: lista bots do parceiro com status (idle/busy). Admin vê também um seletor de parceiro antes (opcional).
3. Ao confirmar:
   - Se o bot escolhido está **idle** → pedido vira `processing` e o bot é atribuído imediatamente.
   - Se está **busy/disabled** → pedido vira `queued` (atribuído ao parceiro). Quando qualquer bot daquele parceiro liberar, `assign_next_queued_order` puxa o próximo da fila por ordem de criação (comportamento atual respeitado).

## Implementação técnica

### 1. Edge function `partner-shop-create-manual-order` (nova)
- Auth obrigatória (Bearer token), valida com `getClaims`.
- Body (zod): `partnerId?` (admin only), `customerName`, `customerEmail`, `customerWhatsapp?`, `targetWorkspace`, `credits` (int 1..100000), `amountCents` (int ≥ 0), `notes` (3..500), `botId?` (uuid).
- Authorization:
  - `callerId === partnerId` (parceiro criando para si) **ou** `has_role(callerId,'admin')`.
  - Se `partnerId` omitido → usa `callerId`.
  - Se `botId` informado → confere que o bot pertence a `partnerId`.
- Insere em `partner_credit_orders` com `status='paid'`, `paid_at=now()`, `tx_id='manual:<uuid>'`, `pack_id=null`, `raw_payload={ manualOrder: { by, notes, at } }`.
- Atribuição:
  - Se `botId` informado e o bot está `idle`: marca bot como `busy`, atualiza pedido para `processing`, `assigned_bot_id`, `assigned_at=now()`.
  - Se `botId` informado mas o bot está `busy/disabled`: pedido fica `queued` (sem `assigned_bot_id`). A fila por parceiro já existente (`assign_next_queued_order`) cuidará — qualquer bot livre puxa por ordem de criação.
  - Se `botId` ausente: chama `assign_bot_to_order` (comportamento atual — usa qualquer idle ou cai para `queued`).
- Insere entrada em `partner_credit_ledger` com `delta=0`, `reason='manual_order:<notes>'` para auditoria.
- Retorna `{ ok: true, orderId, status }`.

### 2. Frontend — `src/pages/dashboard/Pedidos.tsx`
- Novo componente `ManualOrderDialog` (mesmo arquivo ou `components/ManualOrderDialog.tsx`).
- Botão "Nova recarga manual" (variant default) abre o dialog.
- Form com `react-hook-form` + zod schema espelhando o backend.
- Query para listar bots do parceiro (já existe `my-bots-mini`); se admin, query adicional para listar parceiros (`parceiros` + `profiles`) e refetch de bots ao trocar.
- Select de bot mostra: nickname/email + badge de status (idle/busy/disabled). Bots `disabled` ficam desabilitados; `busy` permitidos com aviso "entrará na fila".
- Ao submit: `supabase.functions.invoke('partner-shop-create-manual-order', { body })`. Em sucesso, `qc.invalidateQueries(['my-orders'])` e toast "Recarga criada · status: processando/na fila".

### 3. Sem mudanças de schema
- Reusa `partner_credit_orders`, `farm_bots`, `assign_bot_to_order`, `assign_next_queued_order`, `release_bot`. A fila e a liberação de bots já funcionam pelo trigger atual.

### 4. Segurança
- Validação client + server (zod) em todos os campos.
- Edge function usa service-role apenas após validar caller via JWT.
- Nenhuma alteração de RLS necessária (insert/update via service role na função).

## Fora de escopo

- Cobrança real (PIX) para recarga manual — fica como "valor manual" só para registro.
- Edição/cancelamento de recarga manual após criada (já tratado pelos fluxos de "stop" / refund existentes).
