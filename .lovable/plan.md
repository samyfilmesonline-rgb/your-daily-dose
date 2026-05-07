## Objetivo

Transformar `/comprar/<partnerId>` em uma área profissional para o cliente final acompanhar e gerenciar seus pedidos de créditos, mesmo que feche o navegador. Sem login obrigatório, sem mudar nada do que já funciona (webhook, atribuição de bot, worker Python, edge functions de pagamento).

## Princípios

- **Não quebrar nada**: webhook, `assign_bot_to_order`, `release_bot`, `partner-shop-create-pix`, `partner-shop-check-status` e o painel do parceiro continuam idênticos.
- **Sem auth obrigatória**: cliente final é anônimo. A identidade é construída por (a) fingerprint local persistido em `localStorage` + (b) email do cliente.
- **RLS-safe**: nada de expor tokens/segredos. Acesso ao histórico via uma nova edge function pública que filtra por `customer_email` + `client_fingerprint` (par obrigatório), nunca via query direta com anon key.

## Mudanças

### 1. Identidade do cliente (frontend, sem backend)

- Gerar e persistir em `localStorage` (chave `mf_client_fp`) um UUID v4 na primeira visita à página `/comprar/<partnerId>`. É o "fingerprint" do navegador/dispositivo.
- Manter também `mf_last_email` (último email usado) para pré-preencher o form e permitir "ver meus pedidos" rapidamente.
- Esse fingerprint é enviado no `partner-shop-create-pix` e gravado no pedido. Não é usado pra autenticar nada sensível — só pra listar os pedidos daquele dispositivo.

### 2. Banco

Criar coluna nova em `partner_credit_orders`:

- `client_fingerprint text NULL` — preenchida na criação do pedido. Index em `(partner_id, client_fingerprint)` e `(partner_id, customer_email)` para listagem rápida.

Nada de RLS nova: a tabela continua sem SELECT pra `anon` (já é assim hoje). Toda leitura do cliente final passa por edge function com service role.

### 3. Edge function nova: `partner-shop-list-orders`

Pública (sem JWT). Recebe:
```
{ partnerId, fingerprint, email? }
```
Regras:
- `fingerprint` é obrigatório.
- Retorna pedidos `WHERE partner_id = ? AND (client_fingerprint = ? OR (email IS NOT NULL AND lower(customer_email) = lower(email)))` ordenados por `created_at desc`, limite 30.
- Resposta enxuta: `id, status, credits, amountCents, targetWorkspace, createdAt, paidAt, deliveredAt, failedReason, assignedBotId, botEmail (lookup), pixCopyPaste, pixQrcode, pixExpiresAt, txId, customerEmail` — só campos que o cliente já consegue ver pelos endpoints atuais (sem `customer_tax_id`, `raw_payload`, `senha_lovable`).
- Rate-limit simples por IP + fingerprint (in-memory) pra evitar enumeração.

### 4. Edge function nova: `partner-shop-cancel-order`

Pública. Recebe `{ orderId, fingerprint }`. Só permite cancelar se:
- `client_fingerprint` confere,
- `status = 'pending'` (ainda não pago),
- (opcional) chama o gateway pra cancelar o Pix se a Abacate suportar; se não, apenas marca `status = 'expired'` no banco.

Pedidos `paid/queued/processing/delivered` nunca podem ser cancelados pelo cliente — só suporte. Isso garante que o worker e o bot já atribuído não fiquem em estado inconsistente.

### 5. Atualizar `partner-shop-create-pix`

- Aceitar `clientFingerprint: z.string().uuid()` (opcional por compatibilidade, mas o frontend sempre manda).
- Gravar em `client_fingerprint` no insert.

`partner-shop-check-status` fica como está.

### 6. UI da página `/comprar/<partnerId>`

Reorganizar em três áreas, sem remover nada do que existe:

```
┌──────────────────────────────────────────┐
│ Header (parceiro)                        │
├──────────────────────────────────────────┤
│ [Tab] Comprar créditos | Meus pedidos (N)│
├──────────────────────────────────────────┤
│ Conteúdo da tab                          │
└──────────────────────────────────────────┘
```

**Tab "Comprar créditos"**: exatamente o fluxo atual (requisitos, pacotes, form, dialog de Pix/tracking). Nada muda.

**Tab "Meus pedidos"**:
- Carrega via `partner-shop-list-orders` usando o fingerprint do `localStorage`.
- Campo "Ver pedidos de outro email" → re-consulta passando `email` (útil se trocou de dispositivo).
- Lista com cards/linhas mostrando, por pedido:
  - Status badge colorido (mesmo mapeamento amigável já implementado: pending/paid/queued/processing/delivered/failed/expired/refunded).
  - Créditos, valor, workspace, data de criação, "há X min/h/d".
  - Quando aplicável: email do bot atribuído + botão "Copiar".
  - `failed_reason` quando `failed`.
- Ações por linha:
  - **Pendente**: "Ver Pix" (reabre o `OrderTrackingDialog` em modo Pix com QR/copia-cola já gerado), "Cancelar pedido" (chama `partner-shop-cancel-order`).
  - **Paid/queued/processing**: "Acompanhar" (reabre o `OrderTrackingDialog` no modo guia "convide o bot").
  - **Delivered**: "Ver detalhes" (modal só-leitura).
  - **Failed/Expired/Refunded**: "Ver detalhes" + CTA "Falar com suporte" (WhatsApp do parceiro, se disponível).
- Realtime: assinar `partner_credit_orders` filtrando por `client_fingerprint=eq.<fp>` para atualizar a lista. Como `anon` não tem SELECT, o realtime não vai entregar payloads — então fallback: refetch a cada 15s enquanto a tab estiver aberta + ao voltar foco (`visibilitychange`).

### 7. Reaproveitar o `OrderTrackingDialog`

Refatorar levemente para aceitar um `orderId` (em vez de depender só do `pix` em memória). Quando aberto a partir da lista:
- Faz `partner-shop-check-status` pra hidratar o estado.
- Se `status === 'pending'`, busca também `pix_qrcode` / `pix_copy_paste` via `partner-shop-list-orders` (já vem na resposta) e mostra o QR como na primeira vez.
- Se `paid/queued/processing`, mostra o guia atual com bot/workspace.
- Se terminal, mostra o resumo final.

Isso garante que o cliente que fechou o navegador no meio do Pix consiga voltar e pagar/copiar de novo, sem gerar um pedido novo.

### 8. Persistência leve no localStorage

- `mf_client_fp`: UUID, criado uma vez.
- `mf_last_email`: para pré-preencher e abrir a tab "Meus pedidos" automaticamente quando houver pedidos.
- `mf_active_order_id`: id do último pedido em curso. Ao abrir a página, se existir e ainda estiver em estado não-terminal, abre o tracking dialog automaticamente (com botão "fechar").

### 9. Painel do parceiro

Nada muda na lógica. Opcional: mostrar uma coluna pequena "Origem" (ícone se `client_fingerprint` está preenchido) — mas pode ficar pra outra entrega.

## Detalhes técnicos

- Migração: `ALTER TABLE partner_credit_orders ADD COLUMN client_fingerprint text;` + dois índices `btree`. Sem default, sem NOT NULL — pedidos antigos continuam válidos.
- Tipos do Supabase serão regenerados após a migração.
- Edge functions novas usam `SUPABASE_SERVICE_ROLE_KEY` internamente; nunca expostas ao cliente.
- Rate limit das functions novas: mapa em memória `Map<key, {count, resetAt}>` com janela de 60s, 30 req/min por (ip+fingerprint). Suficiente pra MVP; sem dependência nova.
- Cancelamento: na primeira versão só marca como `expired` no banco se ainda `pending`. Integração de cancelamento real no Abacate fica como TODO comentado (não bloqueia entrega).
- Nenhuma alteração em `assign_bot_to_order`, `release_bot`, `abacatepay-webhook`, worker Python.

## Riscos e mitigação

- **Privacidade**: listar por email permite que alguém com o email do cliente veja pedidos. Mitigação: exigir SEMPRE o fingerprint do dispositivo OU o email; e no caso de email, retornar somente status + créditos + workspace + datas (sem CPF, sem tx_id, sem QR Pix). Ajustar a edge function para "modo reduzido" quando o match foi por email e não por fingerprint.
- **Limpeza do localStorage**: se o cliente limpar, perde o histórico do dispositivo, mas ainda recupera por email (modo reduzido).
- **Cancelamento de pedido pago**: bloqueado por design — evita inconsistência com bot já atribuído.
