# Ocultar processos internos do farm para o cliente final

## Problema

No painel "Farm em andamento" (modal de acompanhamento do pedido) e na lista de "Meus pedidos", o sistema está exibindo mensagens cruas vindas do bot — incluindo termos como `billing`, `stripe`, `login`, nomes de páginas internas, mensagens do Lovable, stack traces e textos de erro do gateway. Isso revela o método de farm para o cliente.

O cliente final só pode saber **que algo está acontecendo** e **quanto já foi farmado** — nunca **como**.

## O que será alterado (somente UI / `src/pages/ComprarParceiro.tsx`)

Nada de backend, schema, edge functions ou lógica de pedido muda. Só o que é renderizado.

### 1. Painel "Farm em andamento" (modal de tracking)

Substituir as mensagens cruas por rótulos neutros estilo hacker, em verde mono:

- `status === "em_andamento"` → continua "farmando…" (ok)
- `status === "limite"` → trocar `"Lovable bloqueou — próxima tentativa automática"` por algo neutro tipo **"cooldown ativo — re-tentando…"** (sem citar Lovable).
- `status === "sucesso" / "concluido"` → manter `+N créditos nesta tentativa` (não vaza método).
- `status === "falha" / "erro"` → **NÃO** mostrar o `erro` cru. Trocar por mensagem genérica: **"tentativa instável — reagendando…"** em verde/âmbar.
- Remover por completo o bloco que renderiza `progress.currentExecution.erro` quando o status não é falha (linha ~1969-1973).
- Na lista `progress.recent` (`<details> Ver últimas tentativas`): remover a renderização de `r.erro`. Mostrar só ícone + créditos + tempo.

### 2. Mensagens "vivas" estilo hacker (opcional, melhora a UX)

Enquanto `currentExecution.status === "em_andamento"`, ciclar a cada ~2s por uma lista fixa de frases neutras em verde mono, dando sensação de atividade sem revelar nada:

```
> conectando nó…
> sincronizando sessão…
> injetando rotina de farm…
> coletando créditos…
> validando saldo…
```

Frases 100% genéricas — nada de "billing", "stripe", "login", "lovable", "página X". Implementado com `useEffect` + `setInterval` local no componente do painel.

### 3. Lista "Meus pedidos" (cards de cada pedido)

Linha ~1597: `Bot: {o.progress.lastMessage}` — está imprimindo a mensagem crua do bot. Trocar por rótulo curto baseado em `lastStatus`:

- `sucesso/concluido` → "última tentativa: sucesso"
- `limite` → "em cooldown"
- `falha/erro` → "reagendando tentativa"
- `em_andamento` → "farmando…"

Nunca renderizar `lastMessage` cru. Remover o `title={o.progress.lastMessage}` do tooltip também.

### 4. Bloco "failedReason" do pedido

Linha ~1602: `{o.status === "failed" && o.failedReason && (...)`. Substituir o texto cru por mensagem padronizada do tipo **"Não foi possível concluir o farm. Saldo creditado para sua próxima compra."** — sem detalhar motivo técnico.

## Detalhes técnicos

- Arquivo único alterado: `src/pages/ComprarParceiro.tsx`.
- Cores: usar tokens já existentes (`text-emerald-400`, `text-amber-400`, `text-destructive`, `font-mono`) — combina com o tema hacker matrix.
- Os campos `erro` e `lastMessage` continuam vindo do backend (não removidos do payload), só não são exibidos. Útil para futura tela de admin.
- Manter o bloco do "convide o bot no workspace Lovable" intacto — é instrução obrigatória para o cliente.

## Verificação

Após o patch: abrir um pedido `processing` no modal e na lista, confirmar que nenhuma string técnica (`billing`, `stripe`, `login`, `Lovable bloqueou`, stack trace, URL, etc.) aparece — só rótulos curtos neutros em verde.
