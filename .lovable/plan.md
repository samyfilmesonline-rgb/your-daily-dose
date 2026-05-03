# Unificar CRM em torno da tabela `resumo_lovable_workspace`

## Diagnóstico

Hoje o CRM mistura dois conceitos sem deixar isso claro:

- **`execucoes_lovable`** = um evento por rodada de farm (cada execução cria uma linha).
- **`resumo_lovable_workspace`** = uma linha por workspace (`id_do_usuario` + `email_lovable` + `workspace_nome`) com totais acumulados: `total_execucoes`, `total_sucessos`, `total_limites`, `total_falhas`, `total_creditos_farmados`, `ultimo_creditos_finais`, `ultima_execucao_status`.

A página "Workspaces" lista **execuções**, não workspaces. Resultado: o mesmo workspace aparece N vezes, contagens em "Clientes" mostram nº de execuções (não de workspaces), e KPIs de "Visão geral" subestimam créditos farmados (usam só 30 dias da tabela de execuções).

## Como ficará (visão do usuário)

```text
Visão geral ──► totais agregados (resumo) + gráfico de novos clientes
Clientes ─────► nº de WORKSPACES por cliente (não execuções)
                 └─► clica no badge ──► /workspaces?conta=...
Workspaces ───► 1 linha por workspace (resumo)
                 ├─ status do último farm + créditos finais atuais
                 ├─ totais: execuções • sucessos • limites • falhas
                 ├─ créditos farmados (lifetime)
                 └─► clica ──► painel lateral com HISTÓRICO de execuções
                                (vem de execucoes_lovable filtrado)
```

Sem dados duplicados, sem informação fragmentada. O usuário entende: "workspace = entidade", "execução = evento daquele workspace".

## Mudanças

### 1. `src/pages/dashboard/Workspaces.tsx` — reescrita
- Trocar fonte principal de `execucoes_lovable` para `resumo_lovable_workspace`.
- Colunas: **Workspace** • **Cliente** (join por `email_lovable` → `contas_lovable`) • **Último status** (badge usando `ultima_execucao_status`) • **Execuções** (sucessos / limites / falhas em mini-bar) • **Créditos farmados** (`total_creditos_farmados`) • **Saldo atual** (`ultimo_creditos_finais`) • **Atualizado em** • **Ações**.
- KPIs no topo: Total de workspaces • Workspaces com erro no último farm • Créditos farmados totais • Execuções totais.
- Filtros: cliente, status do último farm, busca por nome.
- Clicar na linha → `Sheet` lateral com histórico (consulta `execucoes_lovable` por `email_lovable + workspace_nome` daquele resumo).
- Manter "Novo workspace" e "Editar"/"Excluir" só para a tabela `execucoes_lovable` quando aberto pelo histórico (criar/registrar uma execução). Remover criação manual de "workspace" do topo — workspace passa a existir automaticamente quando há execução.
- Botão "Excluir workspace" no resumo: remove a linha do `resumo_lovable_workspace` (e opcionalmente as execuções relacionadas — confirmar com modal).

### 2. `src/pages/dashboard/Accounts.tsx`
- Substituir `wsCount` (que conta execuções) por contagem em `resumo_lovable_workspace` (workspaces únicos por `email_lovable` da conta). Badge passa a refletir nº real de workspaces.

### 3. `src/pages/dashboard/Overview.tsx`
- KPI "Workspaces ativos" → "Workspaces" (total da tabela resumo).
- KPI "Créditos (30d)" → "Créditos farmados (total)" usando `sum(total_creditos_farmados)` do resumo (acumulado real, não só 30 dias).
- Adicionar KPI "Execuções totais" = `sum(total_execucoes)`.
- Lista "Workspaces recentes" → mostrar do `resumo_lovable_workspace` ordenado por `atualizado_em desc`, com `ultima_execucao_status` no badge.

### 4. Tipos
- `src/integrations/supabase/types.ts` é gerado pelo Supabase e já contém a nova tabela. Apenas usar.

## Não muda
- Schema do banco (não altero estrutura, só consumo a tabela nova).
- RLS já está ok (`resumo_lovable_workspace` tem policies por `id_do_usuario`; admins continuam vendo tudo via `contas_lovable`/`execucoes_lovable`; se quiser admin global no resumo também, posso adicionar policy — me avise).
- Página Usuários, Auth, sidebar.

## Detalhe técnico

A junção `resumo → cliente` é por `email_lovable` (a tabela resumo não tem `conta_id`). Faço lookup em memória via `Map<email_lovable, conta>` igual ao padrão atual. Caso futuro: posso propor migration adicionando `conta_id` ao resumo, mas não é necessário agora.

## Pergunta opcional
Quer que admins enxerguem o resumo de **todos** os usuários (igual fazem em contas/execuções)? Hoje a policy de `resumo_lovable_workspace` é só dono. Se sim, adiciono policy `has_role(admin)` no SELECT. Posso assumir **sim** para manter consistência — me diga se preferir manter restrito.
