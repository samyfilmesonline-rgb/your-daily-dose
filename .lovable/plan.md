# Detalhe do pedido com controle total e progresso ao vivo

Hoje o modal de detalhe do pedido só mostra dados estáticos (cliente, valor, status, bot). Vou expandir o mesmo `Dialog` em `src/pages/dashboard/Pedidos.tsx` para trazer progresso em tempo real e um controle para parar o farm.

## O que será adicionado no modal

### 1. Bloco de progresso (sempre visível para `paid`/`queued`/`processing`/`delivered`/`refunded`/`failed`)
- Barra de progresso (`<Progress>` do shadcn) com `farmados / total`
- Porcentagem grande + linha “X de Y créditos farmados”
- Linha extra: tentativas do worker, última execução (status + horário relativo) e último erro se houver
- Heartbeat do bot ao vivo (idle/busy + “há N min”) com alerta visual se >10 min sem heartbeat
- Atualiza sozinho via realtime (já temos canal de `partner_credit_orders` e `farm_bots`) + `refetchInterval` de 5s na query de progresso

### 2. Botão “Parar farm” (novo)
- Aparece quando o pedido é `is_manual` e está em `paid`/`queued`/`processing`
- Confirmação inline antes de executar
- Chama a edge function existente `partner-shop-cancel-manual-order` (mesma que “Cancelar e estornar”) — esse é o caminho seguro hoje: marca `stop_requested_at`, reembolsa o restante para a cota do parceiro e libera o bot
- Mostra quantos créditos foram estornados no toast
- Mantém o botão atual “Cancelar e estornar” (mesmo backend, mesmo efeito) — vou unificar visualmente em um só bloco para não duplicar

## O que NÃO vai mudar

- Sem mudança de schema, sem nova migração, sem nova edge function
- Sem trocar bot, editar workspace, reatribuir, ou pausar sem estornar (não foi pedido)
- PIX/clientes não-manuais continuam idênticos

## Detalhes técnicos

**Arquivo único alterado:** `src/pages/dashboard/Pedidos.tsx`

**Nova query (dentro do modal, habilitada só quando `detail` está aberto):**
```ts
useQuery({
  queryKey: ["order-progress", detail?.id],
  enabled: !!detail?.id && !!detail.assigned_bot_id && !!detail.target_workspace,
  refetchInterval: 5000,
  queryFn: async () => {
    const bot = botById.get(detail.assigned_bot_id!);
    const since = detail.assigned_at ?? detail.paid_at;
    let q = supabase
      .from("execucoes_lovable")
      .select("status, creditos_adicionados, erro, atualizado_em, iniciado_em")
      .eq("id_do_usuario", detail.partner_id)
      .eq("email_lovable", bot!.email_lovable)
      .eq("workspace_nome", detail.target_workspace!)
      .order("iniciado_em", { ascending: false })
      .limit(20);
    if (since) q = q.gte("iniciado_em", since);
    const { data } = await q;
    const farmed = (data ?? []).reduce((a, r) => a + Number(r.creditos_adicionados ?? 0), 0);
    return { farmed, attempts: data?.length ?? 0, last: data?.[0] ?? null };
  },
})
```

**Layout do bloco de progresso (resumo):**
```
┌───────────────────────────────────────────┐
│ Progresso                       62%       │
│ ████████████░░░░░░░░  124 / 200 créditos  │
│ Bot: carlosdemolov23  ·  busy  ·  há 1min │
│ Última execução: sucesso · há 2 min       │
│ Tentativas do worker: 3                   │
└───────────────────────────────────────────┘
```

**Botão parar:**
- `variant="destructive"` com ícone `Square`
- `confirm()` nativo: “Parar o farm agora? O restante será estornado para sua cota.”
- Reusa o handler `cancelLoading` / `partner-shop-cancel-manual-order` já existente

## Critérios de aceite

- Abrir um pedido em processamento mostra barra de progresso preenchendo a cada 5s
- Heartbeat do bot atualiza sozinho (já via realtime) e fica âmbar se >10 min
- Botão “Parar farm” aparece em pedidos manuais ativos, executa o cancelamento e fecha o modal
- Pedido `delivered` mostra barra 100% verde e nenhum botão de parar
