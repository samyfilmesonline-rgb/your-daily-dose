# Project Memory

## Core
Admin pode ativar/desativar qualquer aba do sidebar para qualquer usuário via /dashboard/users → "Permissões". Toda aba nova DEVE ser registrada em `src/lib/sidebar-tabs.ts` para entrar automaticamente nesse painel.
Permissões em `tab_permissions` são autoritativas: só admin vê tudo. Qualquer outro usuário (inclusive parceiro ativo) só vê "Visão geral" por padrão; demais abas exigem permissão explícita.
Cada workspace só recebe até 20 créditos por janela rolling de 24h (global). Pedidos excedentes são reagendados via `partner_order_schedules`, nunca rejeitados — enforço server-side em todas as funções de pedido.

## Memories
- [Permissões de abas](mem://features/tab-permissions) — tabela `tab_permissions`, função `has_tab_access`, catálogo `sidebar-tabs.ts`, painel em `/dashboard/users`.
- [Cooldown 20/24h](mem://features/workspace-cooldown) — helpers SQL, `_shared/limits.ts`, agendamento automático.