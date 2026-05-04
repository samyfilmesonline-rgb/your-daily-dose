# Project Memory

## Core
Admin pode ativar/desativar qualquer aba do sidebar para qualquer usuário via /dashboard/users → "Permissões". Toda aba nova DEVE ser registrada em `src/lib/sidebar-tabs.ts` para entrar automaticamente nesse painel.
Usuário comum (sem permissão e sem ser parceiro ativo) NÃO vê a aba Licenças nem outras abas restritas.

## Memories
- [Permissões de abas](mem://features/tab-permissions) — tabela `tab_permissions`, função `has_tab_access`, catálogo `sidebar-tabs.ts`, painel em `/dashboard/users`.