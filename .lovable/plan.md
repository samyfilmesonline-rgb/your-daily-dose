## Plano

### 1. Checkout do cliente (`src/pages/ComprarParceiro.tsx`)

- Tornar **Workspace Lovable obrigatório** no formulário:
  - Label: "Workspace Lovable"
  - Placeholder: "Ex: Minha Empresa, Projeto SaaS, Workspace do João"
  - Helper text: "Informe o nome exato do workspace Lovable onde os créditos devem ser adicionados."
  - Validação: `required`, mínimo 2 caracteres, máximo 200. Bloquear submit sem ele.
- Reorganizar o form para deixar claro o que é obrigatório (Nome, Email, WhatsApp, Workspace).
- Validar também no edge function `partner-shop-create-pix` (`targetWorkspace` passa de optional para `z.string().min(2).max(200)`), e o handler retorna 400 se vazio.

### 2. Tela de acompanhamento pós-pagamento (mesma página, etapa "paid")

Substituir o bloco atual por uma tela guiada e estável que reage ao status real do pedido.

- Cabeçalho dinâmico (status amigável):
  - `pending` → "Aguardando pagamento Pix"
  - `paid` → "Pagamento confirmado"
  - `queued` → "Na fila para receber um bot"
  - `processing` + bot atribuído → "Aguardando convite do bot ou processamento"
  - `processing` sem bot → "Aguardando atribuição de bot"
  - `delivered` → "Créditos entregues"
  - `failed` → "Não foi possível entregar os créditos"
  - `expired` → "Pagamento expirado"
  - `refunded` → "Pedido reembolsado"
- Bloco de **resumo do pedido** sempre visível: workspace informado, créditos comprados, valor pago, status atual.
- Quando houver bot atribuído, **bloco destacado** "Próximo passo: convide o bot no seu workspace Lovable":
  - Email do bot grande, com botão "Copiar email do bot".
  - Workspace informado em destaque.
  - Lista numerada de passos:
    1. Acesse lovable.dev
    2. Abra o workspace informado na compra
    3. Vá em Settings / Members
    4. Convide o email do bot como Owner
    5. Volte para esta página e aguarde a entrega
  - Aviso explícito: o cliente precisa convidar manualmente; o sistema **não** envia email automático.
- Alertas condicionais:
  - `processing` sem `target_workspace`: alerta vermelho "Workspace não informado. Entre em contato com o suporte para corrigir o pedido."
  - `processing` com bot mas demorando: mensagem neutra "Estamos preparando seu pedido. Se demorar, fale com o suporte." (sem expor heartbeat).
  - `failed`: bloco destrutivo com `failed_reason` e CTA "Falar com suporte".
  - `delivered`: bloco de sucesso com `delivered_at`.
- Realtime: assinar `partner_credit_orders` filtrando por `id` do pedido atual e revalidar via `partner-shop-check-status` quando `status`, `assigned_bot_id`, `delivered_at` ou `failed_reason` mudarem (já parcialmente feito; vamos consolidar).

### 3. Endpoint de status (`partner-shop-check-status`)

- Incluir no retorno: `targetWorkspace`, `credits`, `amountCents`, `assignedBotId`, `botEmail`, `deliveredAt`, `failedReason`, `paidAt`. O frontend usa essa resposta como fonte da verdade.

### 4. Painel do parceiro/admin (`src/pages/dashboard/Pedidos.tsx`)

- Adicionar coluna/visualização para `target_workspace` (já existe), email do bot (já existe), e novos campos:
  - Status do bot (`farm_bots.status`)
  - `last_heartbeat_at` formatado em "há X min" ou "—"
- Alertas no topo da tabela e por linha:
  - Linha vermelha: pedidos `processing`/`paid`/`queued` com `target_workspace` vazio.
  - Linha amarela: pedidos `processing` com bot atribuído mas sem heartbeat nos últimos 10 min.
- Ampliar `farm_bots_partner_view` ou query auxiliar para trazer `status` e `last_heartbeat_at` por bot e juntar no front.
- Atualizar realtime existente para também escutar `farm_bots` (status/heartbeat) — invalidando a query `my-bots-mini`.
- Ajustar `Order` type para incluir os novos campos retornados (`assigned_at` já existe; mostrar tempo em fila).

### 5. Garantias de segurança

- Frontend continua usando apenas o anon key e RLS existentes.
- Nada de `release_bot`, `assign_bot_to_order` ou `service_role` no cliente. Toda atribuição segue via webhook + edge functions.

## Detalhes técnicos

- Nenhum schema de banco precisa mudar — `target_workspace` já existe e aceita texto livre. A obrigatoriedade é aplicada no front + edge function (não no banco) para evitar quebrar pedidos antigos.
- `partner-shop-check-status` é o ponto único de leitura consolidada para o cliente; vamos enriquecer o JSON retornado.
- Para o painel do parceiro, vamos criar um pequeno hook/consulta extra para o status e heartbeat dos bots, sem expor `senha_lovable`.