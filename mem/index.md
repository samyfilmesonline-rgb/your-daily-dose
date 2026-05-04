# Project Memory

## Core
Admin pode ativar/desativar qualquer aba do sidebar para qualquer usuário via /dashboard/users → "Permissões". Toda aba nova DEVE ser registrada em `src/lib/sidebar-tabs.ts` para entrar automaticamente nesse painel.
Permissões em `tab_permissions` são autoritativas: só admin vê tudo. Qualquer outro usuário (inclusive parceiro ativo) só vê "Visão geral" por padrão; demais abas exigem permissão explícita.

## Memories
- [Permissões de abas](mem://features/tab-permissions) — tabela `tab_permissions`, função `has_tab_access`, catálogo `sidebar-tabs.ts`, painel em `/dashboard/users`.