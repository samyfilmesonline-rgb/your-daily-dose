
# Gestão de Workspaces no CRM

Hoje a tabela `execucoes_lovable` armazena execuções/workspaces (nome, créditos, status, datas) e se relaciona ao usuário (`id_do_usuario`) e à conta Lovable apenas pelo `email_lovable` — não há ligação forte com `contas_lovable.id`. Vamos criar essa ligação e expor uma área completa de Workspaces no CRM.

## 1. Banco de dados (migração)

- Adicionar coluna `conta_id uuid` em `execucoes_lovable` referenciando `contas_lovable(id) ON DELETE SET NULL`.
- Criar índice em `(id_do_usuario, conta_id)` e em `(conta_id)`.
- Backfill: preencher `conta_id` em registros existentes fazendo match por `id_do_usuario + email_lovable` com `contas_lovable`.
- Manter RLS atual (já filtra por `auth.uid() = id_do_usuario`). Adicionar policy de DELETE própria do usuário (hoje só há SELECT/INSERT/UPDATE).
- Trigger `set_execucoes_lovable_atualizado_em` já existe — anexá-la se ainda não estiver atrelada.

## 2. Nova página: `/dashboard/workspaces`

Rota nova em `App.tsx` + item no `AppSidebar` ("Workspaces", ícone `Boxes` ou `Briefcase`).

### Layout (mesma estética Matrix neon)
- Header com título "Workspaces", subtítulo e botão **Novo workspace**.
- Cards KPI (glass-card, neon-border):
  - Total de workspaces
  - Em andamento
  - Concluídos
  - Soma de créditos adicionados (período)
- Filtros: busca por nome do workspace/email, filtro por status (em_andamento / concluido / erro / todos), filtro por conta Lovable (select de `contas_lovable`).
- Tabela com colunas:
  - Workspace (nome)
  - Conta Lovable vinculada (nome + email, com link p/ a página Clientes)
  - Status (badge colorido)
  - Créditos (iniciais → finais, com delta de adicionados)
  - Iniciado em / Finalizado em (duração formatada)
  - Erro (tooltip se houver)
  - Ações: editar, excluir

### Formulário (Dialog)
Validação `zod` + `react-hook-form`:
- `workspace_nome` (texto, obrigatório)
- `conta_id` (Select listando contas do usuário; ao escolher, preenche `email_lovable` automaticamente)
- `creditos_iniciais` (numérico, opcional)
- `creditos_adicionados` (numérico, default 0)
- `creditos_finais` (numérico, opcional)
- `status` (Select: em_andamento / concluido / erro)
- `erro` (textarea, opcional, visível só se status = erro)
- `iniciado_em` / `finalizado_em` (datetime-local, opcionais)

Insert envia `id_do_usuario = user.id` e `email_lovable` resolvido pela conta selecionada.

## 3. Integração com a página Clientes

Em `Accounts.tsx`:
- Nova coluna "Workspaces" mostrando contagem de execucoes vinculadas (consulta agregada por `conta_id`).
- Botão na linha que navega para `/dashboard/workspaces?conta=<id>` já filtrando.

## 4. Overview (Visão geral)

Em `Overview.tsx`:
- Adicionar 2 KPIs: "Workspaces ativos" e "Créditos adicionados (30d)".
- Nova seção "Workspaces recentes" (últimos 5) com nome, conta vinculada e status.

## 5. Detalhes técnicos

- Tipos TS regenerados automaticamente após a migração (não editar `types.ts`).
- Status como string com union type no front: `"em_andamento" | "concluido" | "erro"`.
- Badge de status: verde neon (concluido), amber (em_andamento), destructive (erro).
- Duração: diff entre `finalizado_em` e `iniciado_em` formatado (`Xh Ymin`).
- Reutilizar utilitários `glass-card`, `neon-border`, `cyber-grid`, `neon-text` do `index.css`.

## Arquivos a criar/editar
- `supabase/migrations/<timestamp>_link_workspaces_to_contas.sql` (novo)
- `src/pages/dashboard/Workspaces.tsx` (novo)
- `src/App.tsx` (rota)
- `src/components/dashboard/AppSidebar.tsx` (item de menu)
- `src/pages/dashboard/Accounts.tsx` (coluna workspaces + link)
- `src/pages/dashboard/Overview.tsx` (KPIs + lista recente)
