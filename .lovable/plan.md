# Por que o painel "Licenças" não aparece

A implementação anterior ficou pela metade. Hoje no projeto existem apenas:
- `src/lib/licenses.ts` (helpers)
- `src/components/auth/ActivePartnerRoute.tsx` (wrapper de acesso)
- `src/components/dashboard/licenses/LicenseFormDialog.tsx` (formulário)

Mas **faltam três peças críticas**, e por isso nada aparece para ninguém — admin ou parceiro:

1. A página `src/pages/dashboard/Licenses.tsx` nunca foi criada.
2. A rota `/dashboard/licencas` não está registrada em `src/App.tsx`.
3. O item "Licenças" não foi adicionado em `src/components/dashboard/AppSidebar.tsx`.

# O que vou fazer

## 1. Criar `src/pages/dashboard/Licenses.tsx`
Página completa conforme o plano original:
- 4 cards de resumo: Ativas, Bloqueadas, Expirando em 7 dias, Total de clientes.
- Toolbar: busca por nome/e-mail, filtro por status (chips), botão "Nova licença", botão "Atualizar".
- Tabela: Cliente · E-mail · Status (badge) · Plano · Expiração (com destaque âmbar ≤7d / vermelho se vencida) · Máquinas (`machine_hashes.length / max_machines`) · Última atividade · Criada em · Ações.
- Estados: skeleton, empty state, toasts de sucesso/erro.
- Tratamento de erro RLS (`code === '42501'` → "Sem permissão. Confirme se seu cadastro de parceiro está ativo").
- Quando admin estiver em modo "View As", filtra `partner_id = viewAs`. Admin sem View As vê todas as licenças (RLS já permite via `is_active_partner` apenas para parceiros — admin precisa de uma policy adicional **ou** vamos restringir o filtro pelo `partner_id` do próprio admin se ele também for parceiro). **Decisão:** a página assume escopo de parceiro (`partner_id = user.id` ou `viewAs`), pois o RLS atual de `app_licenses` não dá SELECT global a admin. Para admins verem tudo, será necessário ajuste futuro de policy — fora do escopo desta correção.

## 2. Criar `src/components/dashboard/licenses/LicenseRowActions.tsx`
Dropdown por linha com:
- **Editar** → reabre `LicenseFormDialog` em modo edição.
- **Renovar** → popover com +30/+90/+180/+365 dias ou data custom; atualiza `expires_at` e, se estava expirada, volta `status = 'active'`.
- **Bloquear / Reativar** → toggle entre `'blocked'` e `'active'` (AlertDialog para bloquear).
- **Resetar máquina** → AlertDialog → `machine_hash = null`, `machine_hashes = []`, `activated_at = null`.

## 3. Registrar rota em `src/App.tsx`
Adicionar dentro do bloco `/dashboard`:
```tsx
<Route path="licencas" element={<ActivePartnerRoute><Licenses /></ActivePartnerRoute>} />
```

## 4. Adicionar item na sidebar `AppSidebar.tsx`
Novo array `partnerItems` com `{ title: "Licenças", url: "/dashboard/licencas", icon: KeyRound }`, exibido quando `isAdmin || parceiro?.status === "ativo"`. Assim **admin e parceiros ativos** veem o item.

## Sem migration de banco
As policies de `app_licenses` já cobrem insert/select/update para parceiros ativos. Nada de `service_role` no frontend.

## Observação sobre admin
O RLS atual de `app_licenses` permite SELECT só para o cliente dono, ou para o `partner_id` se for parceiro ativo. Admins **que não sejam parceiros** não verão linhas de outros parceiros nesta página. Se você quiser visão global de admin sobre todas as licenças, me avise depois que eu adiciono uma policy `app_licenses_admin_select`.
